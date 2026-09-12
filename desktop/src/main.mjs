import { app, BrowserWindow, dialog, Menu, protocol, session, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { startBackend } from './backend.mjs';
import { registerAppProtocol } from './appProtocol.mjs';
import { createScannerWindow } from './window.mjs';

app.setName('Van Jianpu');
if (process.env.JIANPU_DESKTOP_DATA_DIR) app.setPath('userData', path.resolve(process.env.JIANPU_DESKTOP_DATA_DIR));
protocol.registerSchemesAsPrivileged([{ scheme: 'jianpu', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
let backend;
let window;
let opening;
const openWindow = () => opening ??= createScannerWindow(app.getPath('userData')).then(value => {
  window = value; window.once('closed', () => { window = undefined; }); return value;
}).finally(() => { opening = undefined; });

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } else if (app.isReady() && backend) void openWindow(); });
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length && backend) void openWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => { if (app.isReady()) session.defaultSession.flushStorageData(); backend?.close(); });
  app.whenReady().then(async () => {
    const userData = app.getPath('userData'); mkdirSync(userData, { recursive: true });
    dotenv.config({ path: path.join(userData, '.env'), quiet: true });
    if (!app.isPackaged) dotenv.config({ path: path.resolve(app.getAppPath(), '../.env'), quiet: true });
    backend = await startBackend(path.join(app.getAppPath(), 'runtime'));
    registerAppProtocol(protocol, backend);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({ title: 'Export Jianpu', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { label: 'File', submenu: [{ label: 'Open app data folder', click: () => { void shell.openPath(userData); } }, { type: 'separator' }, { role: process.platform === 'darwin' ? 'close' : 'quit' }] },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : [])] },
      { role: 'windowMenu' },
    ]));
    await openWindow();
  }).catch(error => {
    dialog.showErrorBox('Van Jianpu could not start', `${error.message}\n\nFor a source checkout, run npm run build in the desktop folder and retry.`);
    app.quit();
  });
}
