import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate';
import { decodeProjectFile, encodeProjectArchive } from '../src/services/projectArchive';
import { validateAndMigrateProject, MAX_PROJECT_BYTES } from '../src/services/projectValidation';
import { projectFilename } from '../src/services/projectName';

const fixture = new URL('../../../../analysis_outputs/552c8d531cf8f_row_03.png', import.meta.url);
async function sample() {
  const bytes = await readFile(fixture);
  return validateAndMigrateProject({ version: 2, id: 'sample', activePageId: 'a', name: '二胡練習', pages: ['a', 'b'].map(id => ({
    id, image: { name: `${id}.png`, width: 819, height: 75, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` },
    lines: [{ id: `line-${id}`, box: { x: 0, y: 0, width: 819, height: 75 }, revision: 2, text: '1_// ? | 3', modelText: '1 ? | 3', edited: true, status: 'stale' }],
  })) });
}

test('archive preserves all project data and exact image bytes, deduplicates images, and keeps JSON readable', async () => {
  const project = await sample();
  const archive = encodeProjectArchive(project);
  const entries = unzipSync(archive);
  expect(Object.keys(entries).sort()).toEqual(['images/0.png', 'project.json']);
  expect(Buffer.from(entries['images/0.png'])).toEqual(await readFile(fixture));
  const json = strFromU8(entries['project.json']);
  expect(json).not.toContain('base64');
  expect(json.split('\n').length).toBeGreaterThan(10);
  expect(json.length).toBeLessThan(2500);
  expect(archive.length).toBeLessThan(Buffer.byteLength(JSON.stringify(project)) * 0.45);
  expect(decodeProjectFile(archive)).toEqual(project);
  expect(decodeProjectFile(strToU8(JSON.stringify(project)))).toEqual(project);
  const unnamed = { ...project, name: undefined };
  expect(decodeProjectFile(strToU8(JSON.stringify(unnamed))).name).toBe('a');
  expect(() => validateAndMigrateProject({ ...project, name: '  ' })).toThrow();
  expect(projectFilename({ ...project, name: '二胡 / practice:1?' })).toBe('二胡 - practice-1-');
  console.log(`Project fixture: legacy JSON ${Buffer.byteLength(JSON.stringify(project))} bytes; archive ${archive.length} bytes; manifest ${entries['project.json'].length} bytes.`);
});

test('rejects broken archives, missing images, unsafe paths, future formats and oversized expanded entries', async () => {
  const bytes = encodeProjectArchive(await sample());
  const entries = unzipSync(bytes);
  expect(() => decodeProjectFile(bytes.subarray(0, 30))).toThrow();
  expect(() => decodeProjectFile(zipSync({ 'project.json': entries['project.json'] }))).toThrow(/not a valid/);
  expect(() => decodeProjectFile(zipSync({ ...entries, '../image.png': new Uint8Array(1) }))).toThrow(/not a valid/);
  const manifest = JSON.parse(strFromU8(entries['project.json']));
  expect(() => decodeProjectFile(zipSync({ ...entries, 'project.json': strToU8(JSON.stringify({ ...manifest, version: 4 })) }))).toThrow(/not a valid/);
  manifest.pages[0].image.path = '../image.png';
  expect(() => decodeProjectFile(zipSync({ ...entries, 'project.json': strToU8(JSON.stringify(manifest)) }))).toThrow(/not a valid/);
  // A hostile size claim must fail before allocating or inflating the entry.
  const oversized = Buffer.from(bytes);
  const directory = oversized.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  oversized.writeUInt32LE(MAX_PROJECT_BYTES + 1, directory + 24);
  expect(() => decodeProjectFile(oversized)).toThrow(/100 MB/);
});

test('rename persists and controls every export filename; archive reopens without changing notes or pages', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open project', exact: true })).toBeEnabled();
  await page.getByTestId('project-input').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(await sample())) });
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  const input = page.getByLabel('Project name', { exact: true });
  await input.fill('  ');
  await expect(page.getByRole('button', { name: 'Rename', exact: true })).toBeDisabled();
  await input.fill('  春江花月夜  '); await input.press('Enter');
  await expect(page.locator('.document-caption strong')).toHaveText('春江花月夜');
  await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  await input.fill('Cancelled'); await input.press('Escape');
  await expect(page.locator('.document-caption strong')).toHaveText('春江花月夜');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.document-caption strong')).toHaveText('春江花月夜');
  await page.getByRole('button', { name: 'Move page 2 up', exact: true }).click();
  for (const [label, suffix] of [['Jianpu text (.txt)', 'txt'], ['Rendered notation (.svg)', 'svg'], ['Editable project (.jianpu)', 'jianpu']]) {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const waiting = page.waitForEvent('download');
    await page.getByText(label, { exact: true }).click();
    if (suffix === 'txt') {
      await page.getByRole('dialog').getByRole('button', { name: 'Export', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
    }
    const download = await waiting;
    expect(download.suggestedFilename()).toBe(`春江花月夜.${suffix}`);
    if (suffix === 'jianpu') {
      const path = (await download.path())!;
      const saved = decodeProjectFile(await readFile(path));
      expect(saved.name).toBe('春江花月夜');
      expect(saved.pages.map(p => p.id)).toEqual(['b', 'a']);
      await page.getByTestId('project-input').setInputFiles(path);
      await page.getByRole('button', { name: 'Replace', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Transcription for line 1', exact: true })).toHaveValue('1_// ? | 3');
      await expect(page.locator('.document-caption strong')).toHaveText('春江花月夜');
    }
  }
});

test('JPEG imports retain original bytes and EXIF-oriented dimensions and crops across archive reopening', async ({ page }) => {
  const require = createRequire(new URL('../../backend/package.json', import.meta.url));
  const sharp = require('sharp');
  const pixels = Buffer.alloc(100 * 60 * 3);
  for (let y = 0; y < 60; y++) for (let x = 0; x < 100; x++) pixels[(y * 100 + x) * 3 + (x < 50 ? 0 : 2)] = 255;
  const jpeg: Buffer = await sharp(pixels, { raw: { width: 100, height: 60, channels: 3 } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add images', exact: true })).toBeEnabled();
  await page.getByTestId('image-input').setInputFiles({ name: 'rotated.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const waiting = page.waitForEvent('download');
  await page.getByText('Editable project (.jianpu)', { exact: true }).click();
  const path = (await (await waiting).path())!;
  const saved = decodeProjectFile(await readFile(path));
  expect(saved.pages[0].image).toEqual({ name: 'rotated.jpg', width: 60, height: 100, dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}` });
  await page.getByTestId('project-input').setInputFiles(path);
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toBeVisible();
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + 1, box.y + 1); await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, box.y + box.height - 1, { steps: 8 }); await page.mouse.up();
  const crop = page.getByAltText('Crop for line 1');
  await expect(crop).toBeVisible();
  const colors = await crop.evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
    return [Array.from(ctx.getImageData(5, 5, 1, 1).data), Array.from(ctx.getImageData(5, canvas.height - 6, 1, 1).data)];
  });
  expect(colors[0][0]).toBeGreaterThan(240); expect(colors[0][2]).toBeLessThan(10);
  expect(colors[1][2]).toBeGreaterThan(240); expect(colors[1][0]).toBeLessThan(10);
});
