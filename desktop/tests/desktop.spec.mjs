import { test, expect, _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const desktop = fileURLToPath(new URL('../', import.meta.url));
const fixture = fileURLToPath(new URL('../../../../analysis_outputs/552c8d531cf8f_row_03.png', import.meta.url));
let profile; let application; let provider; let endpoint; let requests;
test.beforeEach(async () => {
  profile = await mkdtemp(path.join(tmpdir(), 'jianpu-electron-test-'));
  requests = [];
  provider = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    requests.push({ url: req.url, authorization: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '1 - - 2_// ?' } }] }));
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${provider.address().port}/v1`;
});
test.afterEach(async () => {
  await application?.close(); application = undefined;
  await new Promise(resolve => provider.close(resolve));
  await rm(profile, { recursive: true, force: true });
});
async function launch() {
  const env = { ...process.env, JIANPU_DESKTOP_DATA_DIR: profile, LLM_BASE_URL: endpoint, LLM_MODEL: 'desktop-test-model', LLM_API_KEY: 'desktop-test-secret' };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    ...(process.env.JIANPU_DESKTOP_EXECUTABLE ? { executablePath: process.env.JIANPU_DESKTOP_EXECUTABLE, args: [] } : { args: [desktop] }),
    env,
  });
  const page = await application.firstWindow();
  await expect(page.getByRole('button', { name: 'Add images', exact: true })).toBeEnabled();
  return page;
}
async function draw(page) {
  await page.getByTestId('image-input').setInputFiles(fixture);
  await expect(page.locator('canvas')).toBeVisible();
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + 2, box.y + 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height - 2, { steps: 10 }); await page.mouse.up();
}

test('desktop imports, scans through its bundled backend, edits, exports, and recovers after restart', async () => {
  let page = await launch();
  expect(page.url()).toBe('jianpu://scanner/');
  const environment = await page.evaluate(() => ({ node: typeof window.require, process: typeof window.process, secure: isSecureContext }));
  expect(environment).toEqual({ node: 'undefined', process: 'undefined', secure: true });
  const preferences = await application.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: p.sandbox, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration };
  });
  expect(preferences).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false });
  const settings = await page.evaluate(() => fetch('/api/settings').then(r => r.json()));
  expect(settings.model).toBe('desktop-test-model'); expect(JSON.stringify(settings)).not.toContain('desktop-test-secret');
  await draw(page);
  await page.getByRole('button', { name: 'Scan 1 pending line', exact: true }).click();
  const editor = () => page.getByRole('textbox', { name: 'Transcription for line 1', exact: true });
  await expect(editor()).toHaveValue('1 - - 2_// ?');
  expect(requests).toHaveLength(1); expect(requests[0].authorization).toBe('Bearer desktop-test-secret');
  const notes = page.getByRole('listbox', { name: 'Notes for line 1', exact: true });
  await notes.getByRole('option').first().click(); await page.keyboard.press('6');
  await expect(editor()).toHaveValue('6 - - 2_// ?');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor()).toHaveValue('1 - - 2_// ?');
  await editor().fill('5 - - 2_// ?');
  await page.getByRole('button', { name: 'Rename project', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Desktop score');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  const exported = path.join(profile, 'export.jianpu');
  await application.evaluate(({ session }, file) => {
    session.defaultSession.once('will-download', (_event, item) => item.setSavePath(file));
  }, exported);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByText('Editable project (.jianpu)', { exact: true }).click();
  await expect.poll(async () => { try { return (await readFile(exported)).subarray(0, 2).toString(); } catch { return ''; } }).toBe('PK');
  await page.getByTestId('project-input').setInputFiles(exported);
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(editor()).toHaveValue('5 - - 2_// ?');
  await expect(page.locator('.document-caption strong')).toHaveText('Desktop score');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/electron-scanner.png' });
  await application.close(); application = undefined;
  page = await launch();
  await expect(editor()).toHaveValue('5 - - 2_// ?');
  expect(page.url()).toBe('jianpu://scanner/');
  const cropWindow = application.waitForEvent('window');
  await page.getByAltText('Crop for line 1').click();
  const crop = await cropWindow;
  await expect(crop.locator('img')).toBeVisible();
  await crop.close();
  expect(application.windows()).toHaveLength(1);
});

test('desktop loads the Erhu AudioWorklet with real audio and denies foreign app hosts', async () => {
  const page = await launch();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await draw(page);
  await page.getByRole('textbox', { name: 'Transcription for line 1', exact: true }).fill('1 - - -');
  await page.evaluate(() => {
    const original = AudioContext.prototype.createGain;
    window.audioLevel = () => 0;
    AudioContext.prototype.createGain = function () {
      const gain = original.call(this); const connect = gain.connect.bind(gain); const context = this;
      gain.connect = function (destination) {
        if (destination === context.destination) {
          const analyser = context.createAnalyser(); analyser.fftSize = 2048;
          connect(analyser); analyser.connect(destination);
          const data = new Float32Array(2048);
          window.audioLevel = () => { analyser.getFloatTimeDomainData(data); return Math.max(...data.map(Math.abs)); };
          return destination;
        }
        return connect(destination);
      };
      return gain;
    };
  });
  await page.getByRole('button', { name: 'Play line 1', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Playback status' })).toHaveText('Playing', { timeout: 15000 });
  await expect.poll(() => page.evaluate(() => window.audioLevel())).toBeGreaterThan(0.001);
  await expect(page.locator('.jianpu-glyph.is-playing')).toHaveCount(1);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.audioLevel())).toBeLessThan(0.0001);
  const rejected = await application.evaluate(async ({ net }) => (await net.fetch('jianpu://foreign/api/settings')).status);
  expect(rejected).toBe(403);
  expect(errors).toEqual([]);
});
