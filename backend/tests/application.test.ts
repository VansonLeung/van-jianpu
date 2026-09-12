import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createApplication } from '../src/application.js';
import { configuration } from '../src/configuration.js';

let server: Server;
let provider: Server;
let origin: string;
let providerOrigin: string;
let providerStatus = 200;
let modelContent = '6_// 7_// 6_// 5_// | ? 0';
let finishReason = 'stop';
let receivedKey = '';
let receivedBody: any;
let image: string;
const originalConfiguration = { ...configuration };

async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return `http://127.0.0.1:${address.port}`;
}
before(async () => {
  const fixture = await readFile(new URL('../../../../analysis_outputs/552c8d531cf8f_row_03.png', import.meta.url));
  image = `data:image/png;base64,${fixture.toString('base64')}`;
  provider = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    receivedBody = JSON.parse(Buffer.concat(chunks).toString());
    receivedKey = req.headers.authorization || '';
    res.writeHead(providerStatus, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(providerStatus === 200 ? { choices: [{ finish_reason: finishReason, message: { content: modelContent } }] } : { error: 'private provider error: fake-secret' }));
  });
  providerOrigin = await listen(provider);
  Object.assign(configuration, { baseUrl: `${providerOrigin}/v1`, model: 'vision-test', apiKey: 'server-secret' });
  server = createServer(createApplication());
  origin = await listen(server);
});
after(async () => {
  Object.assign(configuration, originalConfiguration);
  await Promise.all([server, provider].map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});
const scan = (settings?: object, crop = image) => fetch(`${origin}/api/transcribe`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: crop, settings }),
});

test('settings reveal defaults but never the server API key', async () => {
  const response = await fetch(`${origin}/api/settings`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.ok(body.includes('vision-test'));
  assert.ok(!body.includes('server-secret'));
  assert.equal(JSON.parse(body).hasApiKey, true);
});
test('a real crop is forwarded to the compatible endpoint and returns notation', async () => {
  const response = await scan();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { text: modelContent });
  assert.equal(receivedKey, 'Bearer server-secret');
  assert.equal(receivedBody.model, 'vision-test');
  assert.equal(receivedBody.messages[1].content[1].image_url.url, image);
});
test('overridden endpoints do not receive the backend credential', async () => {
  const response = await scan({ baseUrl: `${providerOrigin}/other-v1` });
  assert.equal(response.status, 200);
  assert.equal(receivedKey, '');
  await scan({ baseUrl: `${providerOrigin}/other-v1`, apiKey: 'session-key' });
  assert.equal(receivedKey, 'Bearer session-key');
});
test('unreadable notes remain isolated tokens', async () => {
  modelContent = '1?2 | 0';
  const response = await scan();
  assert.deepEqual(await response.json(), { text: '1 ? 2 | 0' });
});
test('invalid crops and non-HTTP endpoints are rejected', async () => {
  assert.equal((await scan(undefined, 'data:image/png;base64,invalid')).status, 502);
  assert.equal((await scan(undefined, 'https://example.com/image.png')).status, 400);
  assert.equal((await scan({ baseUrl: 'file:///tmp' })).status, 502);
});
test('provider errors are actionable and do not forward private response bodies', async () => {
  providerStatus = 401;
  const response = await scan();
  const body = await response.text();
  assert.equal(response.status, 502);
  assert.match(body, /HTTP 401/);
  assert.ok(!body.includes('fake-secret'));
  providerStatus = 200;
});
test('prose and truncated responses cannot silently become a successful transcription', async () => {
  modelContent = 'I think the notes are 1 2 3';
  assert.equal((await scan()).status, 502);
  modelContent = '1 2 3';
  finishReason = 'length';
  const response = await scan();
  assert.match(await response.text(), /truncated/);
  finishReason = 'stop';
});
test('the Node backend serves the built app and isolates unknown API routes', async () => {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Van Jianpu/);
  const missing = await fetch(`${origin}/api/missing`);
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type') || '', /json/);
});
