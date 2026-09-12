import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const desktop = fileURLToPath(new URL('../', import.meta.url));
const root = path.dirname(desktop.replace(/[\\/]$/, ''));
if (!process.env.npm_execpath) throw new Error('Run this script with npm run build inside desktop.');
for (const name of ['frontend', 'backend']) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, '--prefix', path.join(root, name), 'run', 'build'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const runtime = path.join(desktop, 'runtime');
await rm(runtime, { recursive: true, force: true });
await mkdir(path.join(runtime, 'backend'), { recursive: true });
// Copy compiled runtime files only. In particular, never copy .env or local projects.
await cp(path.join(root, 'backend/dist'), path.join(runtime, 'backend/dist'), { recursive: true });
await cp(path.join(root, 'frontend/dist'), path.join(runtime, 'frontend/dist'), { recursive: true });
await writeFile(path.join(runtime, 'backend/package.json'), JSON.stringify({ type: 'module' }));
// Copy only the installed production graph, including sharp's host-specific native libraries.
const listed = spawnSync(process.execPath, [process.env.npm_execpath, 'ls', '--omit=dev', '--all', '--parseable'], { cwd: desktop, encoding: 'utf8' });
if (listed.status !== 0) throw new Error(`Cannot resolve desktop production dependencies: ${listed.stderr}`);
for (const source of [...new Set(listed.stdout.trim().split('\n'))]) {
  const relative = path.relative(desktop, source);
  if (!relative || !relative.startsWith(`node_modules${path.sep}`)) continue;
  await cp(source, path.join(runtime, relative), { recursive: true, dereference: true });
}
console.log('Desktop runtime prepared.');
