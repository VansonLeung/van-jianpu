import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { ScannerProject } from '../src/types/scanner';
import { validateAndMigrateProject } from '../src/services/projectValidation';
import { recoverProject } from '../src/services/projectStorage';

const fixture = fileURLToPath(new URL('../../../../analysis_outputs/552c8d531cf8f_row_03.png', import.meta.url));
async function makeProject(): Promise<ScannerProject> {
  const dataUrl = `data:image/png;base64,${(await readFile(fixture)).toString('base64')}`;
  return { version: 2, id: 'test-project', activePageId: 'a', pages: ['a', 'b'].map((id, index) => ({
    id, image: { name: `${id}.png`, dataUrl, width: 819, height: 75 },
    lines: [0, 1].map(n => ({ id: `${id}-${n}`, box: { x: n * 200, y: 0, width: 180, height: 75 }, revision: 0,
      text: `${index * 2 + n + 1}_//`, modelText: '', edited: true, status: 'success' })),
  })) };
}
async function openProject(page: Page, project: unknown = undefined) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open project', exact: true })).toBeEnabled();
  await page.getByTestId('project-input').setInputFiles({ name: 'pages.jianpu.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project || await makeProject())) });
  await expect(page.locator('canvas')).toBeVisible();
}
async function storedProject(page: Page): Promise<ScannerProject> {
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('jianpu-scanner-v4'); r.onsuccess = () => resolve(r.result); });
    return new Promise(resolve => { const r = db.transaction('projects').objectStore('projects').get('current'); r.onsuccess = () => { resolve(r.result); db.close(); }; });
  });
}
const editor = (page: Page, n = 1) => page.getByRole('textbox', { name: `Transcription for line ${n}`, exact: true });

test('multiple image imports append ordered pages; lines belong to their source image', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add images' })).toBeEnabled();
  const buffer = await readFile(fixture);
  await page.getByTestId('image-input').setInputFiles(['first.png', 'second.png'].map(name => ({ name, mimeType: 'image/png', buffer })));
  await expect(page.locator('.page-node')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Select page 1', exact: true })).toContainText('first.png');
  const bounds = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(bounds.x + 2, bounds.y + 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 2, bounds.y + bounds.height - 2, { steps: 8 }); await page.mouse.up();
  await editor(page).fill('1 2 ?');
  await expect(page.locator('.page-node').first().getByRole('button', { name: 'Select line 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select page 2', exact: true }).click();
  await expect(editor(page)).toHaveCount(0);
  await page.getByTestId('image-input').setInputFiles({ name: 'third.png', mimeType: 'image/png', buffer });
  await expect(page.locator('.page-node')).toHaveCount(3);
  const saved = await storedProject(page);
  expect(saved.pages.map(p => p.image.name)).toEqual(['first.png', 'second.png', 'third.png']);
  expect(saved.pages.map(p => p.lines.length)).toEqual([1, 0, 0]);
  expect(saved.activePageId).toBe(saved.pages[2].id);
  await page.getByRole('button', { name: 'Select page 1', exact: true }).click();
  await expect(editor(page)).toHaveValue('1 2 ?');
  // Invalid batches do not partially append or disturb existing pages.
  await page.getByTestId('image-input').setInputFiles([{ name: 'valid.png', mimeType: 'image/png', buffer }, { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken') }]);
  await expect(page.getByText(/broken.png: This image could not be opened/)).toBeVisible();
  expect((await storedProject(page)).pages).toEqual(saved.pages);
});

test('page and line arrows/drag order survive text and JSON export, reopening, and refresh', async ({ page }) => {
  await openProject(page);
  await page.getByRole('button', { name: 'Move line 2 up', exact: true }).click();
  await expect(editor(page)).toHaveValue('2_//');
  await page.getByLabel('Drag line 2', { exact: true }).dragTo(page.locator('[data-line-id="a-1"]'));
  await expect(editor(page)).toHaveValue('1_//');
  await page.getByRole('button', { name: 'Move line 2 up', exact: true }).click();
  await page.getByRole('button', { name: 'Move page 2 up', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select page 1', exact: true })).toContainText('b.png');
  await page.getByLabel('Drag page 2', { exact: true }).dragTo(page.locator('[data-page-id="b"] .page-select'));
  await expect(page.getByRole('button', { name: 'Select page 1', exact: true })).toContainText('a.png');
  await page.getByRole('button', { name: 'Move page 2 up', exact: true }).click();
  const saved = await storedProject(page);
  expect(saved.pages.map(p => p.id)).toEqual(['b', 'a']);
  expect(saved.pages[1].lines.map(l => l.id)).toEqual(['a-1', 'a-0']);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const textDownload = page.waitForEvent('download');
  await page.getByText('Jianpu text (.txt)', { exact: true }).click();
  expect(await readFile((await (await textDownload).path())!, 'utf8')).toBe('3_//\n4_//\n\n2_//\n1_//\n');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByText('Editable project (.jianpu.json)', { exact: true }).click();
  const path = (await (await download).path())!;
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(saved);
  await page.getByTestId('project-input').setInputFiles(path);
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(editor(page)).toHaveValue('2_//');
  await storedProject(page);
  await page.reload();
  await expect(editor(page)).toHaveValue('2_//');
  await expect(page.getByRole('button', { name: 'Select page 2', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Delete page 2', exact: true }).click();
  await page.getByRole('button', { name: 'Delete page', exact: true }).click();
  await expect(editor(page)).toHaveValue('3_//');
  expect((await storedProject(page)).pages.map(p => p.id)).toEqual(['b']);
});

test('switching pages preserves note history and routes scan results to the original page', async ({ page }) => {
  await openProject(page);
  const notes = page.getByRole('listbox', { name: 'Notes for line 1', exact: true });
  await notes.getByRole('option').first().click(); await page.keyboard.press('6');
  await expect(editor(page)).toHaveValue('6_//');
  await page.getByRole('button', { name: 'Select page 2', exact: true }).click();
  await expect(editor(page)).toHaveValue('3_//');
  const foreignLine = await page.evaluateHandle(() => { const data = new DataTransfer(); data.setData('application/x-jianpu-line', JSON.stringify({ pageId: 'a', id: 'a-0' })); return data; });
  await page.locator('[data-line-id="b-0"]').dispatchEvent('drop', { dataTransfer: foreignLine });
  expect((await storedProject(page)).pages.map(p => p.lines.map(l => l.id))).toEqual([['a-0', 'a-1'], ['b-0', 'b-1']]);
  await foreignLine.dispose();
  await page.getByRole('button', { name: 'Select page 1', exact: true }).click();
  await expect(notes.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await notes.focus(); await page.keyboard.press('ControlOrMeta+z');
  await expect(editor(page)).toHaveValue('1_//');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route('**/api/transcribe', async route => { started = true; await gate; await route.fulfill({ json: { text: '7 7' } }); });
  await page.getByRole('button', { name: 'Scan line 1', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await editor(page).fill('5 5');
  await page.getByRole('button', { name: 'Select page 2', exact: true }).click();
  await expect(editor(page)).toHaveValue('3_//');
  release();
  await expect(page.getByRole('button', { name: 'Cancel scanning', exact: true })).toHaveCount(0);
  await expect(editor(page)).toHaveValue('3_//');
  await page.getByRole('button', { name: 'Select page 1', exact: true }).click();
  await expect(editor(page)).toHaveValue('5 5');
  await expect(page.locator('.model-suggestion code')).toHaveText('7 7');
  const saved = await storedProject(page);
  expect(saved.pages[0].lines[0].modelText).toBe('7 7');
  expect(saved.pages[1].lines[0].modelText).toBe('');
});

test('panel drag, keyboard limits, and remembered width preserve source crop coordinates', async ({ page }) => {
  await openProject(page);
  const separator = page.getByRole('separator', { name: 'Resize transcription panel' });
  const panel = page.locator('#transcription-panel');
  const initial = (await panel.boundingBox())!.width;
  const box = (await separator.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 100); await page.mouse.down();
  await page.mouse.move(box.x - 120, box.y + 100, { steps: 12 }); await page.mouse.up();
  const resized = (await panel.boundingBox())!.width;
  expect(resized).toBeGreaterThan(initial + 115);
  await page.screenshot({ path: 'test-results/multipage-resizable-panel.png', fullPage: true, animations: 'disabled' });
  await page.reload();
  await expect(separator).toHaveAttribute('aria-valuenow', String(resized));
  await separator.focus(); await page.keyboard.press('Home');
  await expect(separator).toHaveAttribute('aria-valuenow', '300');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(separator).toHaveAttribute('aria-valuenow', '350');
  await page.keyboard.press('End');
  expect(await separator.getAttribute('aria-valuenow')).toBe(await separator.getAttribute('aria-valuemax'));
  await separator.dblclick(); await expect(separator).toHaveAttribute('aria-valuenow', '390');
  expect((await storedProject(page)).pages[0].lines[0].box).toEqual({ x: 0, y: 0, width: 180, height: 75 });
  await page.setViewportSize({ width: 760, height: 900 });
  await expect(separator).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(760);
});

test('legacy JSON and autosaved projects migrate; invalid saved data is not overwritten', async ({ page }) => {
  const project = await makeProject();
  const legacy = { version: 1, id: project.id, image: project.pages[0].image, lines: project.pages[0].lines };
  await openProject(page, legacy);
  await expect(editor(page)).toHaveValue('1_//');
  expect((await storedProject(page)).version).toBe(2);
  async function seed(value: unknown) {
    await page.evaluate(async value => {
      const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('jianpu-scanner-v4'); r.onsuccess = () => resolve(r.result); });
      await new Promise<void>(resolve => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put(value, 'current'); tx.oncomplete = () => { db.close(); resolve(); }; });
    }, value);
  }
  await seed(legacy); await page.reload();
  await expect(editor(page)).toHaveValue('1_//');
  expect((await storedProject(page)).pages[0].lines).toEqual(legacy.lines);
  const invalid = { ...project, activePageId: 'missing' };
  await seed(invalid); await page.reload();
  await expect(page.getByText('Local recovery unavailable', { exact: true })).toBeVisible();
  expect(await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('jianpu-scanner-v4'); r.onsuccess = () => resolve(r.result); });
    return new Promise(resolve => { const r = db.transaction('projects').objectStore('projects').get('current'); r.onsuccess = () => { db.close(); resolve(r.result); }; });
  })).toEqual(invalid);
});

test('project validation rejects cross-page ID collisions and out-of-image boxes; recovery covers all pages', async () => {
  const project = await makeProject();
  const duplicate = structuredClone(project); duplicate.pages[1].lines[0].id = duplicate.pages[0].lines[0].id;
  expect(() => validateAndMigrateProject(duplicate)).toThrow(/not a valid/);
  const outside = structuredClone(project); outside.pages[1].lines[0].box.x = 800;
  expect(() => validateAndMigrateProject(outside)).toThrow(/not a valid/);
  expect(() => validateAndMigrateProject({ ...project, pages: [project.pages[0], project.pages[0]] })).toThrow(/not a valid/);
  project.pages.forEach(p => { p.lines[0].status = 'scanning'; });
  const recovered = recoverProject(validateAndMigrateProject(project));
  expect(recovered.pages.map(p => p.lines[0].status)).toEqual(['error', 'error']);
  expect(recovered.pages.map(p => p.lines[0].text)).toEqual(['1_//', '3_//']);
});
