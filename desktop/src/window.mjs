import { BrowserWindow, shell, screen } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { APP_ORIGIN, isAppUrl } from './appProtocol.mjs';

const webPreferences = { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true };
function restoredBounds(file) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (![value.x, value.y, value.width, value.height].every(Number.isFinite)) return {};
    const fits = screen.getAllDisplays().some(({ workArea: r }) => value.x + 100 > r.x && value.x < r.x + r.width - 100 && value.y + 100 > r.y && value.y < r.y + r.height - 100);
    return fits ? { x: value.x, y: value.y, width: Math.max(800, Math.min(value.width, 4000)), height: Math.max(600, Math.min(value.height, 2400)) } : {};
  } catch { return {}; }
}
export async function createScannerWindow(userData) {
  const stateFile = path.join(userData, 'window.json');
  const win = new BrowserWindow({ width: 1440, height: 940, minWidth: 800, minHeight: 600, title: 'Van Jianpu', backgroundColor: '#f4f5f7', show: false, ...restoredBounds(stateFile), webPreferences });
  win.webContents.on('will-navigate', (event, url) => { if (!isAppUrl(url)) event.preventDefault(); });
  win.webContents.on('will-redirect', (event, url) => { if (!isAppUrl(url)) event.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(url)) {
      const crop = new BrowserWindow({ width: 1000, height: 500, title: 'Line crop', parent: win, webPreferences });
      crop.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      crop.webContents.on('will-navigate', event => event.preventDefault());
      void crop.loadURL(url);
    } else if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', () => { try { writeFileSync(stateFile, JSON.stringify(win.getNormalBounds())); } catch { /* Window position is optional. */ } });
  win.once('ready-to-show', () => win.show());
  await win.loadURL(`${APP_ORIGIN}/`);
  return win;
}
