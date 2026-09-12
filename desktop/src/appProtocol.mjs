export const APP_ORIGIN = 'jianpu://scanner';
export function isAppUrl(value) {
  try { const url = new URL(value); return url.protocol === 'jianpu:' && url.host === 'scanner' && !url.username && !url.password; }
  catch { return false; }
}
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'";

export function registerAppProtocol(protocol, backend) {
  protocol.handle('jianpu', async request => {
    if (!isAppUrl(request.url)) return new Response('Unknown app host', { status: 403 });
    const url = new URL(request.url);
    const headers = new Headers();
    for (const name of ['content-type', 'accept', 'range']) {
      const value = request.headers.get(name); if (value) headers.set(name, value);
    }
    headers.set('x-jianpu-desktop', backend.token);
    try {
      // Node fetch keeps this internal request separate from Chromium's origin/cache.
      const response = await fetch(`${backend.origin}${url.pathname}${url.search}`, {
        method: request.method, headers, signal: request.signal,
        ...(request.method !== 'GET' && request.method !== 'HEAD' ? { body: request.body, duplex: 'half' } : {}),
        redirect: 'error',
      });
      const outgoing = new Headers(response.headers);
      outgoing.set('Content-Security-Policy', CSP);
      outgoing.set('X-Content-Type-Options', 'nosniff');
      return new Response(response.body, { status: response.status, headers: outgoing });
    } catch (error) {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      return Response.json({ error: 'The desktop backend is unavailable. Restart the app and try again.' }, { status: 502 });
    }
  });
}
