import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseNoteNotation } from '../src/services/noteNotation';
import { layoutJianpuTokens } from '../src/services/rendering/jianpuLayout';
import { lineSvg, projectSvg } from '../src/services/rendering/jianpuSvg';
import type { ScannerProject } from '../src/types/scanner';

test('layout separates every mark and wraps at bars without splitting glyphs', () => {
  const tokens = parseNoteNotation('#4_/// 5^^.// b7_/ 0./ |: 1 2 :| ? - n4___').tokens;
  const layout = layoutJianpuTokens(tokens, 240);
  const first = layout.glyphs[0];
  const underlines = first.primitives.filter(p => p.mark === 'underline');
  const low = first.primitives.find(p => p.mark === 'lower-dot')!;
  expect(underlines).toHaveLength(3);
  expect(low.y).toBeGreaterThan(Math.max(...underlines.map(p => p.y)) + 4);
  expect(layout.glyphs[1].primitives.filter(p => p.mark === 'upper-dot')).toHaveLength(2);
  expect(layout.glyphs[1].primitives.filter(p => p.mark === 'rhythm-dot')).toHaveLength(1);
  expect(layout.glyphs[3].primitives.filter(p => p.mark === 'underline')).toHaveLength(1);
  expect(layout.glyphs[4].primitives.filter(p => p.mark === 'repeat-dot')).toHaveLength(2);
  expect(layout.glyphs[10].primitives.filter(p => p.mark === 'lower-dot')).toHaveLength(3);
  for (const glyph of layout.glyphs) {
    expect(glyph.x + glyph.width).toBeLessThanOrEqual(layout.width);
    expect(glyph.y + glyph.height).toBeLessThanOrEqual(layout.height);
    for (const primitive of glyph.primitives) { expect(primitive.y).toBeGreaterThan(0); expect(primitive.y).toBeLessThan(glyph.height); }
  }
  const bars = layoutJianpuTokens(parseNoteNotation('1 2 | 3 4 5').tokens, 155).glyphs;
  expect(bars[2].y).toBe(bars[0].y);
  expect(bars[3].y).toBeGreaterThan(bars[2].y);
  const repeatStart = layoutJianpuTokens(parseNoteNotation('1 2 |: 3 4').tokens, 120).glyphs;
  expect(repeatStart[2].y).toBe(repeatStart[3].y);
  const exportText = lineSvg(layout, '<unsafe & title>');
  expect(exportText).toContain('&lt;unsafe &amp; title&gt;');
  expect(exportText).not.toContain('is-selected');
  expect(exportText).not.toContain('aria-current');
});

async function openPreview(page: Page, text = '#4_/// 5^^.// b7_/ 0./ |: 1 2 :| ? - n4___') {
  const dataUrl = `data:image/png;base64,${(await readFile(new URL('../../../../analysis_outputs/552c8d531cf8f_row_03.png', import.meta.url))).toString('base64')}`;
  const project: ScannerProject = { version: 2, id: 'render-project', activePageId: 'page-a', pages: [{ id: 'page-a', image: { name: 'Page <A> & notes.png', dataUrl, width: 819, height: 75 }, lines: [
    { id: 'line-a', text, modelText: '', edited: true, revision: 0, status: 'success', box: { x: 0, y: 0, width: 819, height: 75 } },
    { id: 'line-b', text: '6 7', modelText: '', edited: true, revision: 0, status: 'success', box: { x: 0, y: 0, width: 300, height: 75 } },
  ] }] };
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open project', exact: true })).toBeEnabled();
  await page.getByTestId('project-input').setInputFiles({ name: 'render.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('canvas')).toBeVisible();
  return project;
}
const preview = (page: Page) => page.getByRole('listbox', { name: 'Rendered notes for line 1', exact: true });
const editor = (page: Page) => page.getByRole('textbox', { name: 'Transcription for line 1', exact: true });

test('SVG selection shares text, shortcuts, context menus, undo and invalid-input recovery', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openPreview(page);
  const notes = preview(page).getByRole('option');
  await expect(notes).toHaveCount(11);
  await expect(page.getByRole('listbox', { name: 'Rendered notes for line 2', exact: true })).toHaveCount(0);
  await notes.nth(0).click(); await notes.nth(1).click({ modifiers: ['Shift'] });
  await expect(page.getByRole('listbox', { name: 'Notes for line 1', exact: true }).getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await notes.nth(0).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Subdivision · Mixed/ }).hover();
  await page.getByRole('menuitem', { name: /No underline \(quarter\)/ }).click();
  await expect(editor(page)).toHaveValue('#4_ 5^^. b7_/ 0./ |: 1 2 :| ? - n4___');
  await expect(notes.nth(0).locator('[data-mark="underline"]')).toHaveCount(0);
  await expect(preview(page)).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(notes.nth(0).locator('[data-mark="underline"]')).toHaveCount(3);
  await page.keyboard.press('Shift+F10');
  await expect.poll(() => page.getByRole('menu', { name: 'Note context menu', exact: true }).evaluate(menu => menu.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await notes.nth(8).click(); await page.keyboard.press('3');
  await expect(notes.nth(8)).toHaveAttribute('aria-label', 'Note 9: 3');
  await editor(page).fill('1////');
  await expect(preview(page)).toHaveCount(0);
  await expect(editor(page)).toHaveValue('1////');
  await editor(page).fill('1^ 2_');
  await expect(preview(page).getByRole('option')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('preview drag ranges, zoom, panel reflow and standalone SVG export preserve notation', async ({ page }) => {
  const project = await openPreview(page);
  const notes = preview(page).getByRole('option');
  const first = (await notes.nth(0).boundingBox())!; const second = (await notes.nth(1).boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2); await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 10 }); await page.mouse.up();
  await expect(notes.nth(0)).toHaveAttribute('aria-selected', 'true'); await expect(notes.nth(1)).toHaveAttribute('aria-selected', 'true');
  const oldBox = await preview(page).locator('svg').getAttribute('viewBox');
  await page.getByRole('button', { name: 'Increase notation size for line 1', exact: true }).click();
  await expect(preview(page).locator('svg')).not.toHaveAttribute('viewBox', oldBox!);
  const separator = page.getByRole('separator', { name: 'Resize transcription panel' });
  await separator.focus(); await page.keyboard.press('Home');
  await expect.poll(() => preview(page).evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await expect(editor(page)).toHaveValue(project.pages[0].lines[0].text);
  await separator.focus(); await page.keyboard.press('End');
  await page.screenshot({ path: 'test-results/jianpu-svg-preview.png', fullPage: true, animations: 'disabled' });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG for line 1', exact: true }).click();
  const svg = await readFile((await (await download).path())!, 'utf8');
  expect(svg).toContain('♯'); expect(svg).toContain('<circle'); expect(svg).not.toContain('jianpu-hit-area');
  expect(await page.evaluate(svg => new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('parsererror').length, svg)).toBe(0);
  const full = projectSvg({ ...project, pages: [project.pages[0], { ...project.pages[0], id: 'page-b', image: { ...project.pages[0].image, name: 'Second page' }, lines: [] }] });
  expect(full.indexOf('Page 1')).toBeLessThan(full.indexOf('Page 2'));
  expect(full).toContain('Page &lt;A&gt; &amp; notes.png');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const fullDownload = page.waitForEvent('download');
  await page.getByText('Rendered notation (.svg)', { exact: true }).click();
  const fullSvg = await readFile((await (await fullDownload).path())!, 'utf8');
  expect(fullSvg.indexOf('Line 1')).toBeLessThan(fullSvg.indexOf('Line 2'));
  await page.getByRole('checkbox', { name: 'Show Jianpu preview for line 1', exact: true }).uncheck();
  await expect(preview(page)).toHaveCount(0);
});

test('playback highlights rendered notes independently of editing selection', async ({ page }) => {
  await openPreview(page, '1 - - 2');
  await preview(page).getByRole('option').nth(3).click();
  await page.getByRole('button', { name: 'Play line 1', exact: true }).click();
  await expect(preview(page).getByRole('option').nth(0)).toHaveAttribute('aria-current', 'true', { timeout: 15000 });
  await expect(preview(page).getByRole('option').nth(3)).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(preview(page).locator('[aria-current="true"]')).toHaveCount(0);
});
