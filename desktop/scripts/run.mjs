import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const env = { ...process.env, JIANPU_SOURCE_ENV: fileURLToPath(new URL('../../.env', import.meta.url)) };
const cli = fileURLToPath(new URL('../node_modules/electrobun/bin/electrobun.cjs', import.meta.url));
const child = spawn(process.execPath, [cli, 'run'], { env, stdio: 'inherit' });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
