import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startBackend } from '../src/backend.mjs';
import { isAppUrl } from '../src/appProtocol.mjs';

test('the private backend requires its launch token and closes its listener', async () => {
  const backend = await startBackend(fileURLToPath(new URL('../runtime', import.meta.url)));
  try {
    assert.equal((await fetch(`${backend.origin}/api/settings`)).status, 403);
    assert.equal((await fetch(`${backend.origin}/api/health`, { headers: { 'x-jianpu-desktop': 'wrong' } })).status, 403);
    const response = await fetch(`${backend.origin}/api/health`, { headers: { 'x-jianpu-desktop': backend.token } });
    assert.deepEqual(await response.json(), { ok: true });
  } finally { backend.close(); }
  await assert.rejects(fetch(`${backend.origin}/api/health`));
});
test('the app origin rejects credentials, foreign hosts, protocols and ports', () => {
  assert.equal(isAppUrl('jianpu://scanner/api/settings'), true);
  for (const url of ['https://scanner/', 'file:///tmp/file', 'jianpu://evil/', 'jianpu://scanner:3001/', 'jianpu://user:password@scanner/']) assert.equal(isAppUrl(url), false);
});
