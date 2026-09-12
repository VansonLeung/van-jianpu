import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeTranscription } from '../src/transcriptionPrompt.js';

test('compact real-model output keeps every digit and separates unreadable notes', () => {
  assert.equal(normalizeTranscription('7-124 1 5 7-124 1 7 | 6 6765 4 5 2124 5654 2124 5646 5 |5 0 6165 4561'),
    '7 - 1 2 4 1 5 7 - 1 2 4 1 7 | 6 6 7 6 5 4 5 2 1 2 4 5 6 5 4 2 1 2 4 5 6 4 6 5 | 5 0 6 1 6 5 4 5 6 1');
  assert.equal(normalizeTranscription('1?2'), '1 ? 2');
  assert.equal(normalizeTranscription('```text\n#4^/b7_//n4. |:0:|\n```'), '#4^/ b7_// n4. |: 0 :|');
});
test('unsupported characters are rejected rather than silently removed', () => {
  for (const input of ['notes: 1 2 3', '1 8 3', '1 9', '1 ♫ 2', '1//// 2', '', ' ', '1___^^']) {
    assert.throws(() => normalizeTranscription(input), /unsupported notation/);
  }
});
