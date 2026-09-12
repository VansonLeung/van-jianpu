import Electrobun, { BrowserWindow, ApplicationMenu, Utils, PATHS, BuildConfig, Screen } from 'electrobun/main';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { startBackend } from './backend.mjs';

const runtime = path.join(PATHS.RESOURCES_FOLDER, 'app/runtime');
const mode = await BuildConfig.get();
const userData = path.resolve(process.env.JIANPU_DESKTOP_DATA_DIR || path.join(Utils.paths.appData, 'Van Jianpu Electrobun', mode.channel));
mkdirSync(userData, { recursive: true });
const dotenv = createRequire(path.join(runtime, 'backend/package.json'))('dotenv');
dotenv.config({ path: path.join(userData, '.env'), quiet: true });
if (!mode.isPackaged && process.env.JIANPU_SOURCE_ENV) dotenv.config({ path: process.env.JIANPU_SOURCE_ENV, quiet: true });
let win: BrowserWindow | undefined;
let backend: Awaited<ReturnType<typeof startBackend>> | undefined;
const stateFile = path.join(userData, 'window.json');
function frame() {
  try {
    const value = JSON.parse(readFileSync(stateFile, 'utf8'));
    const fits = Screen.getAllDisplays().some(({ workArea: r }) => value.x + 100 > r.x && value.x < r.x + r.width - 100 && value.y + 100 > r.y && value.y < r.y + r.height - 100);
    if (fits && [value.x, value.y, value.width, value.height].every(Number.isFinite)) return { ...value, width: Math.max(800, Math.min(value.width, 4000)), height: Math.max(600, Math.min(value.height, 2400)) };
  } catch { /* Use a centered window on first launch or after a display change. */ }
  return { width: 1440, height: 940 };
}
function saveFrame() { try { if (win) writeFileSync(stateFile, JSON.stringify(win.getFrame())); } catch { /* Geometry is optional. */ } }
const shutdown = () => { saveFrame(); backend?.close(); };
process.on('exit', shutdown);
Electrobun.events.on('before-quit', shutdown);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { shutdown(); Utils.quit(); });

try {
  // Explicit local diagnostic hook; no fixtures or test scripts are shipped in the app.
  const harness = process.env.JIANPU_DESKTOP_TEST_SCRIPT
    ? await import(pathToFileURL(process.env.JIANPU_DESKTOP_TEST_SCRIPT).href).then(module => module.createHarness()) : undefined;
  backend = await startBackend(runtime, userData, { onActivate: () => { win?.unminimize(); win?.show(); win?.activate(); }, testHandler: harness?.handle });
  if (backend.alreadyRunning) Utils.quit();
  else {
    const bounds = frame();
    win = new BrowserWindow({ title: 'Van Jianpu', frame: bounds, url: null, renderer: 'native', sandbox: true });
    // Apply to the initialized native view before loading any content. The 2.0.1
    // constructor option alone does not enforce the policy on WKWebView.
    win.webview.setNavigationRules(['^*', `${backend.origin}/*`, `blob:${backend.origin}/*`,
      'data:image/png;base64,*', 'data:image/jpeg;base64,*', 'data:image/webp;base64,*']);
    win.webview.loadURL(backend.launchUrl!);
    if (!('x' in bounds)) win.center();
    win.on('move', saveFrame); win.on('resize', saveFrame); win.on('will-close', saveFrame);
    for (const eventName of ['download-completed', 'download-failed'] as const) win.webview.on(eventName, (event: any) => {
      const detail = { filename: path.basename(String(event.data.detail.filename || 'project')), failed: eventName === 'download-failed' };
      win?.webview.executeJavascript(`window.dispatchEvent(new CustomEvent('jianpu-desktop-download', { detail: ${JSON.stringify(detail)} }))`);
    });
    Electrobun.events.on(`new-window-open-${win.webview.id}`, (event: { data: { detail: string | { url: string } } }) => {
      const url = typeof event.data.detail === 'string' ? event.data.detail : event.data.detail.url;
      if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(url)) {
        const crop = new BrowserWindow({ title: 'Line crop', frame: { width: 1000, height: 500 }, renderer: 'native', sandbox: true,
          html: `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"></head><body style="margin:0"><img src="${url}" style="max-width:100%"></body></html>`, navigationRules: JSON.stringify(['^*', 'about:blank']) });
        crop.center();
        crop.webview.setNavigationRules(['^*', 'about:blank']);
      } else if (/^https?:\/\//i.test(url)) Utils.openExternal(url);
    });
    ApplicationMenu.setApplicationMenu([
      { label: 'Van Jianpu', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit', accelerator: 'CmdOrCtrl+Q' }] },
      { label: 'File', submenu: [{ label: 'Open app data folder', action: 'data-folder' }, { label: 'Open Downloads folder', action: 'downloads' }, { type: 'separator' }, { role: 'close' }] },
      { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: 'View', submenu: [{ label: 'Reload', action: 'reload', accelerator: 'CmdOrCtrl+R' }, { role: 'toggleFullScreen' }, ...(!mode.isPackaged ? [{ label: 'Developer tools', action: 'devtools' }] : [])] },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
    ]);
    ApplicationMenu.on('application-menu-clicked', (event: any) => {
      if (event.data.action === 'data-folder') Utils.openPath(userData);
      if (event.data.action === 'downloads') Utils.openPath(Utils.paths.downloads);
      if (event.data.action === 'reload') win?.webview.loadURL(backend!.launchUrl!);
      if (event.data.action === 'devtools') win?.webview.toggleDevTools();
    });
    await harness?.start({ win, backend, runtime, userData, quit: () => Utils.quit() });
  }
} catch (error) {
  console.error('Van Jianpu could not start:', error);
  await Utils.showMessageBox({ type: 'error', title: 'Van Jianpu could not start', message: error instanceof Error ? error.message : String(error), buttons: ['Quit'] });
  Utils.quit(1);
}
