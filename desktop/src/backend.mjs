import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
export function isAppUrl(value, origin) {
  try { const url = new URL(value); return url.origin === origin && !url.username && !url.password; }
  catch { return false; }
}

/** @param {{onActivate?: () => void, testHandler?: import('node:http').RequestListener}} [options] */
export async function startBackend(runtime, userData, options = {}) {
  const { onActivate = () => {}, testHandler } = options;
  mkdirSync(userData, { recursive: true });
  const stateFile = path.join(userData, 'server.json');
  let previous;
  try { previous = JSON.parse(readFileSync(stateFile, 'utf8')); } catch { /* First launch. */ }
  const port = Number.isInteger(previous?.port) && previous.port >= 1024 && previous.port <= 65535 ? previous.port : 0;
  const { createApplication } = await import(pathToFileURL(path.join(runtime, 'backend/dist/application.js')).href);
  const application = createApplication();
  const token = randomBytes(32).toString('hex');
  let origin;
  const server = createServer((request, response) => {
    const reject = () => { response.writeHead(403); response.end('Forbidden'); };
    let url;
    try { url = new URL(request.url || '/', origin); } catch { return reject(); }
    if (!isAppUrl(url.href, origin)) return reject();
    if (request.headers.host !== new URL(origin).host) return reject();
    if (request.headers.origin && request.headers.origin !== origin) return reject();
    if (request.headers['sec-fetch-site'] === 'cross-site') return reject();
    response.setHeader('Content-Security-Policy', CSP);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    // Establish an HttpOnly session without injecting privileged JS into the webview.
    if (request.method === 'GET' && url.pathname === '/__desktop/launch' && url.searchParams.get('token') === token) {
      response.writeHead(303, { Location: '/', 'Set-Cookie': `jianpu_session=${token}; HttpOnly; SameSite=Strict; Path=/`, 'Cache-Control': 'no-store' });
      response.end(); return;
    }
    const authenticated = request.headers.cookie?.split(';').some(cookie => cookie.trim() === `jianpu_session=${token}`);
    const nativeAuthenticated = request.headers['x-jianpu-desktop'] === token;
    if (!authenticated && !nativeAuthenticated) return reject();
    if (request.method === 'POST' && url.pathname === '/__desktop/activate' && nativeAuthenticated) {
      onActivate(); response.writeHead(204); response.end(); return;
    }
    if (testHandler && url.pathname.startsWith('/__test/')) { testHandler(request, response); return; }
    application(request, response);
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  } catch (error) {
    if (error.code === 'EADDRINUSE' && port && typeof previous?.token === 'string') {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/__desktop/activate`, { method: 'POST', headers: { 'x-jianpu-desktop': previous.token }, signal: AbortSignal.timeout(2000), redirect: 'error' });
        if (response.status === 204) return { alreadyRunning: true, close() {} };
      } catch { /* Another application owns the saved port. */ }
      throw new Error(`The desktop storage port ${port} is in use by another application. Close that application and retry; your saved project has been preserved.`);
    }
    throw error;
  }
  origin = `http://127.0.0.1:${server.address().port}`;
  // Reuse this origin on every launch so WebKit's IndexedDB and settings survive restarts.
  writeFileSync(stateFile, JSON.stringify({ port: server.address().port, token }), { mode: 0o600 });
  return { origin, token, launchUrl: `${origin}/__desktop/launch?token=${token}`, alreadyRunning: false,
    close() { server.closeAllConnections(); server.close(); } };
}
