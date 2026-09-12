import { test } from 'node:test';
import { request } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startBackend, isAppUrl } from '../src/backend.mjs';
const runtime = fileURLToPath(new URL('../runtime', import.meta.url));
// Fresh connections avoid reusing an HTTP pool across the deliberate server restart.
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: options.method, headers: options.headers, agent: false }, res => {
      const chunks = []; res.on('data', bytes => chunks.push(bytes));
      res.on('end', () => resolve(new Response(res.statusCode === 204 ? null : Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })));
    });
    req.on('error', reject); req.end();
  });
}

test('desktop authenticates assets/API, rejects foreign origins, and preserves its origin over restarts', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'jianpu-server-'));
  let activated = false;
  let backend;
  try {
    backend = await startBackend(runtime, profile, { onActivate: () => { activated = true; } });
    const { origin, token } = backend;
    const headers = { 'x-jianpu-desktop': token };
    assert.equal((await fetch(`${origin}/api/settings`)).status, 403);
    assert.equal((await fetch(`${origin}/api/settings`, { headers: { ...headers, Origin: 'https://example.com' } })).status, 403);
    assert.equal(await new Promise(resolve => { const req = request(`${origin}/api/settings`, { headers: { ...headers, Host: 'evil.local' } }, res => { res.resume(); resolve(res.statusCode); }); req.end(); }), 403);
    assert.deepEqual(await (await fetch(`${origin}/api/health`, { headers })).json(), { ok: true });
    const launch = await fetch(backend.launchUrl, { redirect: 'manual' });
    assert.equal(launch.status, 303);
    assert.match(launch.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const page = await fetch(origin, { headers: { Cookie: `jianpu_session=${token}` } });
    assert.equal(page.status, 200); assert.match(await page.text(), /<div id="root">/);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    const second = await startBackend(runtime, profile);
    assert.equal(second.alreadyRunning, true); assert.equal(activated, true);
    backend.close();
    backend = await startBackend(runtime, profile);
    assert.equal(backend.origin, origin); assert.notEqual(backend.token, token);
    assert.equal((await fetch(`${origin}/api/health`, { headers })).status, 403);
  } finally { backend?.close(); await rm(profile, { recursive: true, force: true }); }
});

test('navigation validation rejects credentials and every foreign origin', () => {
  const origin = 'http://127.0.0.1:32123';
  assert.equal(isAppUrl(`${origin}/api/settings`, origin), true);
  for (const value of ['https://example.com/', 'file:///tmp/file', 'http://127.0.0.1:32124/', 'http://user:password@127.0.0.1:32123/']) assert.equal(isAppUrl(value, origin), false);
});
