import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { compilePlayback, DEFAULT_PLAYBACK, playbackSignature } from '../src/services/playback/notationPlayback';
import { validateAndMigrateProject } from '../src/services/projectValidation';
import type { ScannerProject } from '../src/types/scanner';

function projectWith(text: string): ScannerProject {
  return { version: 2, id: 'audio-project', activePageId: 'page-a', pages: [{ id: 'page-a', image: { name: 'a.png', dataUrl: '', width: 819, height: 75 },
    lines: [{ id: 'line-a', text, modelText: '', edited: true, revision: 0, status: 'success', box: { x: 0, y: 0, width: 819, height: 75 } }] }] };
}
const compile = (text: string, patch = {}) => compilePlayback(projectWith(text), { scope: 'project' }, { ...DEFAULT_PLAYBACK, ...patch });

test('playback maps key, octave, natural/sharp/flat, exact subdivisions, dots, rests and sustains', () => {
  const result = compile('1 2/ 3.// - | 0/ ? 7_ 1^');
  expect(result.sounds.map(n => n.midi)).toEqual([60, 62, 64, 59, 72]);
  expect(result.markers.map(n => n.end - n.start)).toEqual([1, 0.5, 0.375, 1, 0.5, 1, 1, 1]);
  expect(result.sounds[2]).toEqual({ midi: 64, start: 1.5, end: 2.875 });
  expect(result.warnings).toContain('? uses one silent quarter note; its timing is estimated.');
  expect(compile('1 2 3 n3 #3 b3', { tonic: 2 }).sounds.map(n => n.midi)).toEqual([62, 64, 66, 65, 66, 64]);
  expect(compile('1/// 0./// -').beats).toBe(1.3125);
  expect(() => compile('- 1')).toThrow(/leading/);
  expect(() => compile('1^^^^^^^^^^')).toThrow(/MIDI range/);
  expect(() => compile('1 8')).toThrow(/Unsupported/);
});

test('simple repeats, page boundaries and selected ranges preserve timeline identity', () => {
  const p = projectWith('1 |: 2');
  p.pages.push({ ...p.pages[0], id: 'page-b', lines: [{ ...p.pages[0].lines[0], id: 'line-b', text: '3 :| 4' }] });
  const result = compilePlayback(p, { scope: 'project' }, { ...DEFAULT_PLAYBACK, honorRepeats: true });
  expect(result.markers.map(m => m.text)).toEqual(['1', '2', '3', '2', '3', '4']);
  expect(result.beats).toBe(6);
  expect(result.markers[2].pageId).toBe('page-b');
  expect(compile('|: 1 :|').beats).toBe(1);
  expect(() => compile('|: 1', { honorRepeats: true })).toThrow(/matching end/);
  expect(() => compile('|: |: 1 :| :|', { honorRepeats: true })).toThrow(/Nested/);
  expect(compilePlayback(projectWith('1 2 3'), { scope: 'selection', pageId: 'page-a', lineId: 'line-a', start: 1, end: 2 }, DEFAULT_PLAYBACK).sounds.map(n => n.midi)).toEqual([62, 64]);
  const sig = playbackSignature(p);
  p.activePageId = 'page-b'; p.playback = { ...DEFAULT_PLAYBACK, volume: 0 };
  expect(playbackSignature(p)).toBe(sig);
  p.pages.reverse(); expect(playbackSignature(p)).not.toBe(sig);
});

async function openAudioProject(page: Page, text: string, secondPage?: string) {
  const p = projectWith(text);
  p.pages[0].image.dataUrl = `data:image/png;base64,${(await readFile(new URL('../../../../analysis_outputs/552c8d531cf8f_row_03.png', import.meta.url))).toString('base64')}`;
  if (secondPage) p.pages.push({ ...p.pages[0], id: 'page-b', lines: [{ ...p.pages[0].lines[0], id: 'line-b', text: secondPage }] });
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    (window as any).__audioLevel = () => 0;
    window.AudioContext = class extends Native {
      createGain() {
        const gain = super.createGain(); const connect = gain.connect.bind(gain);
        gain.connect = ((destination: AudioNode) => {
          if (destination === this.destination) {
            const analyser = this.createAnalyser(); analyser.fftSize = 2048;
            connect(analyser); analyser.connect(destination);
            const data = new Float32Array(analyser.fftSize);
            (window as any).__audioLevel = () => { analyser.getFloatTimeDomainData(data); return Math.max(...data.map(Math.abs)); };
            return destination;
          }
          return connect(destination);
        }) as typeof gain.connect;
        return gain;
      }
    };
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open project', exact: true })).toBeEnabled();
  await page.getByTestId('project-input').setInputFiles({ name: 'audio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p)) });
  await expect(page.locator('canvas')).toBeVisible();
}
const audioLevel = (page: Page) => page.evaluate(() => (window as any).__audioLevel() as number);
const status = (page: Page) => page.getByRole('status', { name: 'Playback status' });

test('real bundled Erhu produces audio; pause, resume, stop and editing control it', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openAudioProject(page, '1 - - - 2 - - -');
  await page.getByRole('button', { name: 'Play line 1', exact: true }).click();
  await expect(status(page)).toHaveText('Playing', { timeout: 15000 });
  await expect.poll(() => audioLevel(page)).toBeGreaterThan(0.001);
  await expect(page.locator('.note-token.is-playing')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/erhu-playback.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(status(page)).toHaveText('Paused');
  await expect.poll(() => audioLevel(page)).toBeLessThan(0.0001);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(status(page)).toHaveText('Playing');
  await expect.poll(() => audioLevel(page)).toBeGreaterThan(0.001);
  await page.getByRole('textbox', { name: 'Transcription for line 1' }).fill('2 3');
  await expect(status(page)).toHaveText('Stopped');
  await expect.poll(() => audioLevel(page)).toBeLessThan(0.0001);
  await expect(page.getByText(/Playback stopped because/)).toBeVisible();
  await page.getByRole('button', { name: 'Play page', exact: true }).click();
  await expect(status(page)).toHaveText('Playing');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect.poll(() => audioLevel(page)).toBeLessThan(0.0001);
  expect(errors).toEqual([]);
});

test('project playback follows pages and includes unknown/rest timing; selection loops without changing selection', async ({ page }) => {
  await openAudioProject(page, '0 ? 1/', '2 -');
  await page.getByRole('button', { name: 'Play project', exact: true }).click();
  await expect(status(page)).toHaveText('Playing', { timeout: 15000 });
  await expect(page.getByText(/uses one silent quarter/)).toBeVisible();
  await expect.poll(() => audioLevel(page)).toBeLessThan(0.0001);
  await expect(page.getByRole('button', { name: 'Select page 2', exact: true })).toHaveAttribute('aria-expanded', 'true', { timeout: 5000 });
  await expect.poll(() => audioLevel(page)).toBeGreaterThan(0.001);
  await expect(status(page)).toHaveText('Stopped', { timeout: 5000 });
  const notes = page.getByRole('listbox', { name: 'Notes for line 1', exact: true }).getByRole('option');
  await notes.first().click();
  await page.getByRole('button', { name: 'Loop selection', exact: true }).click();
  await expect(status(page)).toHaveText('Playing');
  await page.waitForTimeout(1500); // More than two cycles at the default tempo.
  await expect(status(page)).toHaveText('Playing');
  await expect(notes.first()).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => audioLevel(page)).toBeGreaterThan(0.001);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('playback settings persist, invalid input fails clearly, and correction audition is opt-in', async ({ page }) => {
  await openAudioProject(page, '1 -');
  await page.getByRole('spinbutton', { name: 'Playback tempo' }).fill('120');
  await page.getByRole('spinbutton', { name: 'Playback tempo' }).press('Tab');
  await page.getByRole('combobox', { name: 'Playback key' }).click();
  await page.getByTitle('D', { exact: true }).click();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Playback tempo' })).toHaveValue('120');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByText('Editable project (.jianpu.json)', { exact: true }).click();
  const saved = validateAndMigrateProject(JSON.parse(await readFile((await (await download).path())!, 'utf8')));
  expect(saved.playback).toEqual({ ...DEFAULT_PLAYBACK, tempo: 120, tonic: 2 });
  const notes = page.getByRole('listbox', { name: 'Notes for line 1', exact: true });
  await notes.getByRole('option').first().click(); await page.keyboard.press('3');
  await expect(status(page)).toHaveText('Stopped');
  await page.getByRole('checkbox', { name: 'Audition corrections' }).check();
  await notes.focus(); await page.keyboard.press('4');
  await expect(status(page)).toHaveText('Playing', { timeout: 15000 });
  await expect.poll(() => audioLevel(page)).toBeGreaterThan(0.001);
  await page.getByRole('textbox', { name: 'Transcription for line 1' }).fill('8');
  await page.getByRole('button', { name: 'Play line 1', exact: true }).click();
  await expect(page.locator('.playback-error')).toContainText('Unsupported');
  await expect(status(page)).toHaveText('Stopped');
});

test('all-rest passages retain duration, short selections loop, and Space leaves textarea typing alone', async ({ page }) => {
  await openAudioProject(page, '0 ? 0');
  await page.getByRole('button', { name: 'Play page', exact: true }).click();
  await expect(status(page)).toHaveText('Playing', { timeout: 15000 });
  await expect(page.getByLabel('Playback position', { exact: true })).toContainText('/ 0:02.0');
  await expect.poll(() => audioLevel(page)).toBeLessThan(0.0001);
  await expect(status(page)).toHaveText('Stopped', { timeout: 5000 });
  const text = page.getByRole('textbox', { name: 'Transcription for line 1' });
  await text.fill('1///'); await text.press('End'); await text.press('Space');
  await expect(text).toHaveValue('1/// '); await expect(status(page)).toHaveText('Stopped');
  await page.getByRole('listbox', { name: 'Notes for line 1', exact: true }).getByRole('option').first().click();
  await page.getByRole('button', { name: 'Loop selection', exact: true }).click();
  await expect(status(page)).toHaveText('Playing');
  await page.waitForTimeout(400); // Several cycles of a thirty-second note.
  await expect.poll(() => audioLevel(page)).toBeGreaterThan(0.001);
  await page.getByRole('listbox', { name: 'Notes for line 1', exact: true }).focus(); await page.keyboard.press('Space');
  await expect(status(page)).toHaveText('Paused');
  await page.keyboard.press('Space'); await expect(status(page)).toHaveText('Playing');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
});

test('soundfont loads on demand, failures can retry, and Stop cancels a pending load', async ({ page }) => {
  let requests = 0;
  await page.route('**/*.sf2', route => { requests++; return route.fulfill({ status: 503, body: 'Unavailable' }); });
  await openAudioProject(page, '1 -');
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Play page', exact: true }).click();
  await expect(page.locator('.playback-error')).toContainText('503');
  await expect(status(page)).toHaveText('Stopped');
  await page.unroute('**/*.sf2');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route('**/*.sf2', async route => { requested = true; await gate; await route.continue(); });
  await page.getByRole('button', { name: 'Play page', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  release();
  await expect(status(page)).toHaveText('Stopped');
  await expect.poll(() => audioLevel(page)).toBeLessThan(0.0001);
  await page.getByRole('button', { name: 'Play page', exact: true }).click();
  await expect(status(page)).toHaveText('Playing', { timeout: 15000 });
  await expect.poll(() => audioLevel(page)).toBeGreaterThan(0.001);
});
