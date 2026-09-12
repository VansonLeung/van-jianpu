import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const desktop = fileURLToPath(new URL('../', import.meta.url));
const executable = process.env.JIANPU_DESKTOP_EXECUTABLE;

test('native Electrobun imports, scans, edits, exports/reopens, plays real Erhu audio and recovers after restart', { skip: !executable, timeout: 110000 }, async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'jianpu-native-'));
  let child;
  const provider = createServer(async (req, res) => { for await (const _ of req) {} res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '1 - - 2_// ?' } }] })); });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  try {
    const origins = [];
    for (const phase of ['first', 'restart']) {
      const resultFile = path.join(profile, phase + '.json');
      child = spawn(executable, [], { cwd: path.dirname(executable), env: { ...process.env, JIANPU_DESKTOP_DATA_DIR: profile, JIANPU_DESKTOP_TEST_SCRIPT: path.join(desktop, 'tests/native-harness.mjs'), JIANPU_TEST_RESULT: resultFile, JIANPU_TEST_PHASE: phase, JIANPU_TEST_FIXTURE: fileURLToPath(new URL('../../../../analysis_outputs/552c8d531cf8f_row_03.png', import.meta.url)), LLM_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`, LLM_MODEL: 'native-test', LLM_API_KEY: 'test-only' }, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
      const exited = await new Promise(resolve => { child.on('exit', code => resolve(code)); child.on('error', error => resolve(error)); const timer = setTimeout(() => { child.kill('SIGKILL'); }, 50000); child.once('exit', () => clearTimeout(timer)); });
      let result; try { result = JSON.parse(await readFile(resultFile, 'utf8')); } catch { throw new Error(`Native app failed (${exited}): ${output}`); }
      assert.equal(result.ok, true, JSON.stringify(result) + '\n' + output);
      assert.equal(result.secure, true); origins.push(result.origin);
      if (phase === 'first') { assert.ok(result.peak > 0.001); assert.equal(result.node, 'undefined'); assert.equal((await readFile(path.join(profile, 'export.jianpu'))).subarray(0, 2).toString(), 'PK'); }
      console.log('Native WebKit:', JSON.stringify(result));
    }
    assert.equal(origins[0], origins[1]);
  } finally { child?.kill(); await new Promise(resolve => provider.close(resolve)); await rm(profile, { recursive: true, force: true }); }
});
