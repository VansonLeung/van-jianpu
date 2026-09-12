import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../../../../analysis_outputs/552c8d531cf8f_row_03.png', import.meta.url));
async function openSheet(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add images', exact: true })).toBeEnabled();
  await page.getByTestId('image-input').setInputFiles(fixture);
  await expect(page.locator('canvas')).toBeVisible();
}
async function drawLine(page: Page, fraction = 1) {
  await page.getByText('Draw', { exact: true }).click();
  const bounds = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(bounds.x + 2, bounds.y + 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * fraction - 2, bounds.y + bounds.height - 2, { steps: 12 });
  await page.mouse.up();
}

test('scan, edit during a request, retry, refresh, export and reopen a project', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openSheet(page);
  await drawLine(page);
  await expect(page.getByRole('textbox', { name: 'Transcription for line 1' })).toBeVisible();
  let responseText = '7_/ 1_// 2// 4// | ? 0';
  await page.route('**/api/transcribe', async route => {
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ json: { text: responseText } });
  });
  await page.getByRole('button', { name: 'Scan 1 pending line', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Transcription for line 1' });
  await expect(editor).toHaveValue(responseText);
  responseText = '1 2 3 | ?';
  await page.getByRole('button', { name: 'Scan line 1', exact: true }).click();
  await editor.fill('7 1 2 4 | 0');
  await expect(page.getByText('Latest model result')).toBeVisible();
  await expect(page.locator('.model-suggestion code')).toHaveText(responseText);
  await expect(editor).toHaveValue('7 1 2 4 | 0');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(editor).toHaveValue('7 1 2 4 | 0');
  await page.screenshot({ path: 'test-results/scanner-workspace.png', fullPage: true, animations: 'disabled' });

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const textDownload = page.waitForEvent('download');
  await page.getByText('Jianpu text (.txt)', { exact: true }).click();
  expect((await textDownload).suggestedFilename()).toMatch(/\.txt$/);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const projectDownload = page.waitForEvent('download');
  await page.getByText('Editable project (.jianpu)', { exact: true }).click();
  const savedProject = await (await projectDownload).path();
  await page.getByTestId('project-input').setInputFiles(savedProject!);
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(editor).toHaveValue('7 1 2 4 | 0');
  expect(errors).toEqual([]);
});

test('coordinates stay in source pixels through zoom, reorder, resize, and recovery', async ({ page }) => {
  await openSheet(page);
  await drawLine(page, 0.55);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await drawLine(page, 0.35);
  await page.getByRole('textbox', { name: 'Transcription for line 1' }).fill('1 2');
  await page.getByRole('textbox', { name: 'Transcription for line 2' }).fill('3 4');
  await page.getByRole('button', { name: 'Move line 2 up', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Transcription for line 1' })).toHaveValue('3 4');
  // Move the selected smaller rectangle to make its existing text stale.
  const canvas = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(canvas.x + 70, canvas.y + 20);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 110, canvas.y + 21, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByText('The crop changed. Scan again to update the transcription.')).toBeVisible();
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('jianpu-scanner-v4'); r.onsuccess = () => resolve(r.result); });
    return await new Promise<any>(resolve => { const r = db.transaction('projects').objectStore('projects').get('current'); r.onsuccess = () => resolve(r.result); });
  });
  expect(stored.pages[0].image.width).toBe(819);
  expect(stored.pages[0].lines[1].box.width).toBeGreaterThan(430);
  expect(stored.pages[0].lines[1].box.width).toBeLessThan(455);
  const selectedBox = stored.pages[0].lines[0].box;
  const scale = canvas.width / stored.pages[0].image.width;
  const handleX = canvas.x + (selectedBox.x + selectedBox.width) * scale;
  const handleY = canvas.y + (selectedBox.y + selectedBox.height / 2) * scale;
  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(handleX - 30, handleY, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => page.getByAltText('Crop for line 1').evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeLessThan(selectedBox.width - 15);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Transcription for line 1' })).toHaveValue('3 4');
  await page.getByRole('button', { name: 'Delete line 2', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Transcription for line 2' })).toHaveCount(0);
});

test('failed requests can be retried and settings retain no session key on refresh', async ({ page }) => {
  await openSheet(page);
  await drawLine(page);
  await page.route('**/api/transcribe', route => route.fulfill({ status: 502, json: { error: 'Provider unavailable' } }));
  await page.getByRole('button', { name: 'Scan 1 pending line', exact: true }).click();
  await expect(page.getByText('Provider unavailable', { exact: true })).toBeVisible();
  await page.unroute('**/api/transcribe');
  await page.route('**/api/transcribe', route => route.fulfill({ json: { text: '1 ? 3' } }));
  await page.getByRole('button', { name: 'Scan line 1', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Transcription for line 1' })).toHaveValue('1 ? 3');
  await page.getByRole('button', { name: 'LLM settings', exact: true }).click();
  await page.getByLabel('Vision model', { exact: true }).fill('another-vision-model');
  await page.getByLabel('API key', { exact: true }).fill('session-secret');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  const storage = await page.evaluate(() => localStorage.getItem('jianpu-llm-settings'));
  expect(storage).not.toContain('session-secret');
  await page.reload();
  await page.getByRole('button', { name: 'LLM settings', exact: true }).click();
  await expect(page.getByLabel('Vision model', { exact: true })).toHaveValue('another-vision-model');
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('');
});

test('cancelling a batch leaves queued lines ready and refresh recovers interrupted scans', async ({ page }) => {
  await openSheet(page);
  await drawLine(page, 0.8);
  await drawLine(page, 0.5);
  await drawLine(page, 0.3);
  let requests = 0;
  await page.route('**/api/transcribe', async () => { requests++; });
  await page.getByRole('button', { name: 'Scan 3 pending lines', exact: true }).click();
  await expect.poll(() => requests).toBe(2);
  await page.getByRole('button', { name: 'Cancel scanning', exact: true }).click();
  await expect(page.getByText('Scan cancelled. Retry when ready.', { exact: true })).toHaveCount(2);
  expect(requests).toBe(2);
  await page.getByRole('button', { name: 'Scan 3 pending lines', exact: true }).click();
  await expect.poll(() => requests).toBe(4);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('The previous scan was interrupted. Retry this line.', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Scan 3 pending lines', exact: true })).toBeEnabled();
});
