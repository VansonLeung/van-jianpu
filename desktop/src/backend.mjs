import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export async function startBackend(runtime) {
  const { createApplication } = await import(pathToFileURL(path.join(runtime, 'backend/dist/application.js')).href);
  const application = createApplication();
  const token = randomBytes(32).toString('hex');
  const server = createServer((request, response) => {
    // The private bridge is the only client. Ordinary browser origins cannot use it.
    if (request.headers['x-jianpu-desktop'] !== token) { response.writeHead(403); response.end('Forbidden'); return; }
    application(request, response);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`, token,
    close() { server.closeAllConnections(); server.close(); },
  };
}
