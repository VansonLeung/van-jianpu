import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

export function createHarness() {
  let context; let timer; let nativeDownload; let blocked = false;
  const fixture = readFileSync(process.env.JIANPU_TEST_FIXTURE);
  const resultPath = process.env.JIANPU_TEST_RESULT;
  const phase = process.env.JIANPU_TEST_PHASE || 'first';
  return {
    handle(req, res) {
      if (req.url === '/__test/crop') { const crop = context.win.constructor.getById(context.win.id + 1); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(crop ? { sandbox: crop.sandbox, image: crop.html.includes('data:image/png') } : null)); crop?.close(); return; }
      if (req.url === '/__test/navigation') { res.end('ok'); setTimeout(() => context.win.webview.executeJavascript("location.href = 'http://localhost:54321/foreign'"), 100); return; }
      if (req.url === '/__test/navigation-status') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(blocked)); return; }
      if (req.url === '/__test/native-download') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(nativeDownload || null)); return; }
      if (req.url === '/__test/image') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(fixture); return; }
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const bytes = Buffer.concat(chunks);
        if (req.url === '/__test/export') { writeFileSync(path.join(context.userData, 'export.jianpu'), bytes); res.end('ok'); return; }
        if (req.url === '/__test/result') {
          clearInterval(timer); if (nativeDownload?.path) { try { unlinkSync(nativeDownload.path); } catch {} } writeFileSync(resultPath, bytes); console.log('NATIVE_RESULT', bytes.toString()); res.end('ok');
          setTimeout(() => context.quit(), 500); return;
        }
        res.end('ok');
      });
    },
    async start(value) {
      context = value;
      context.win.webview.on('will-navigate', event => { try { const detail = JSON.parse(event.data.detail); if (detail.url === 'http://localhost:54321/foreign' && detail.allowed === false) blocked = true; } catch {} });
      context.win.webview.on('download-completed', event => {
        const detail = event.data.detail;
        if (detail.filename.startsWith('jianpu-native-smoke-')) nativeDownload = { ...detail, signature: readFileSync(detail.path).subarray(0, 2).toString() };
      });
      const script = `(${browserTest.toString()})(${JSON.stringify(phase)})`;
      timer = setInterval(() => context.win.webview.executeJavascript(script), 500);
      setTimeout(() => { if (!readResult(resultPath)) { if (nativeDownload?.path) { try { unlinkSync(nativeDownload.path); } catch {} } writeFileSync(resultPath, JSON.stringify({ error: 'Native smoke test timed out' })); context.quit(); } }, 45000).unref();
    },
  };
}
function readResult(file) { try { return readFileSync(file, 'utf8'); } catch { return ''; } }

async function browserTest(phase) {
  if (window.__nativeTestStarted || !document.querySelector('[aria-label="Add images"]')) return;
  window.__nativeTestStarted = true;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async fn => { for (let n = 0; n < 160; n++) { const value = await fn(); if (value) return value; await sleep(100); } throw new Error('Timed out: ' + fn.toString()); };
  const button = label => document.querySelector('button[aria-label="' + label + '"]');
  const text = () => document.querySelector('textarea[aria-label="Transcription for line 1"]');
  const setInput = (el, value) => { Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const report = data => fetch('/__test/result', { method: 'POST', body: JSON.stringify(data) });
  try {
    await wait(() => !button('Add images').disabled);
    if (phase === 'restart') {
      await wait(() => text()?.value === '5 - - 2_// ?');
      await wait(() => document.querySelector('.document-caption strong')?.textContent === 'Native score');
      await report({ ok: true, phase, origin: location.origin, secure: isSecureContext }); return;
    }
    const png = await (await fetch('/__test/image')).blob();
    const dataUrl = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(png); });
    const project = { version: 2, id: 'native-test', name: 'Native score', activePageId: 'p', pages: [{ id: 'p', image: { name: 'sheet.png', width: 819, height: 75, dataUrl }, lines: [{ id: 'line', box: { x: 0, y: 0, width: 819, height: 75 }, revision: 0, text: '', modelText: '', edited: false, status: 'idle' }] }] };
    const transfer = new DataTransfer(); transfer.items.add(new File([JSON.stringify(project)], 'test.json', { type: 'application/json' }));
    const input = document.querySelector('[data-testid="project-input"]'); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(() => text());
    button('Scan line 1').click();
    await wait(() => text().value === '1 - - 2_// ?');
    setInput(text(), '5 - - 2_// ?');
    await wait(() => text().value === '5 - - 2_// ?');
    let exported;
    const blobs = new Map(); const createUrl = URL.createObjectURL;
    URL.createObjectURL = blob => { const url = createUrl(blob); blobs.set(url, blob); return url; };
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download.endsWith('.jianpu')) { exported = Promise.resolve(blobs.get(this.href)).then(async blob => { await fetch('/__test/export', { method: 'POST', body: blob }); return blob; }); }
      else original.call(this);
    };
    button('Export').click();
    const item = await wait(() => [...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent.includes('Editable project (.jianpu)'))); item.click();
    await wait(() => exported); const archive = await exported;
    // Exercise the real WKDownload delegate, then verify and remove only this test's file.
    const nativeLink = document.createElement('a'); nativeLink.href = URL.createObjectURL(archive);
    nativeLink.download = 'jianpu-native-smoke-' + crypto.randomUUID() + '.jianpu'; original.call(nativeLink);
    const nativeFile = await wait(async () => (await fetch('/__test/native-download')).json());
    if (nativeFile.signature !== 'PK') throw new Error('Native download is not a project archive');
    await wait(() => document.body.innerText.includes('Saved to Downloads:'));
    URL.revokeObjectURL(nativeLink.href);
    const data = new DataTransfer(); data.items.add(new File([archive], 'native.jianpu', { type: 'application/zip' }));
    input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    const replace = await wait(() => [...document.querySelectorAll('.ant-modal button')].find(el => el.textContent === 'Replace')); replace.click();
    await wait(() => text()?.value === '5 - - 2_// ?');
    await wait(() => button('Play line 1') && !document.querySelector('.ant-modal-confirm'));
    const caps = { secure: isSecureContext, worklet: typeof AudioWorkletNode, node: typeof window.require, origin: location.origin, agent: navigator.userAgent };
    const createGain = AudioContext.prototype.createGain;
    let level = () => 0;
    AudioContext.prototype.createGain = function () {
      const gain = createGain.call(this); const connect = gain.connect.bind(gain); const context = this;
      gain.connect = function (dest) { if (dest === context.destination) { const meter = context.createAnalyser(); meter.fftSize = 2048; connect(meter); meter.connect(dest); const data = new Float32Array(2048); level = () => { meter.getFloatTimeDomainData(data); return Math.max(...data.map(Math.abs)); }; return dest; } return connect(dest); };
      return gain;
    };
    button('Play line 1').click();
    await wait(() => document.querySelector('[aria-label="Playback status"]')?.textContent === 'Playing');
    const peak = await wait(() => level() > 0.001 ? level() : 0);
    button('Stop').click();
    document.querySelector('img[alt="Crop for line 1"]').click();
    const crop = await wait(async () => (await fetch('/__test/crop')).json());
    if (!crop.sandbox || !crop.image) throw new Error('Crop did not open as an isolated image window');
    await fetch('/__test/navigation');
    await wait(async () => { try { return await (await fetch('/__test/navigation-status')).json(); } catch { return false; } });
    await wait(() => [...document.querySelectorAll('.app-status span')].some(el => el.textContent === 'Saved locally'));
    await report({ ok: true, phase, archiveBytes: archive.size, peak, ...caps });
  } catch (error) { await report({ error: error.message, phase, body: document.body.innerText.slice(-2500) }); }
}
