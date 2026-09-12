import { test, expect } from '@playwright/test';
import { parseNoteNotation, transformSelectedNotes } from '../src/services/noteNotation';

test('compact input preserves note boundaries and attribute operations leave unrelated notes intact', () => {
  const { tokens, error } = parseNoteNotation('#4_///6.// 0/ | ?');
  expect(error).toBe('');
  expect(tokens.map(token => [token.text, token.start, token.end])).toEqual([
    ['#4_///', 0, 6], ['6.//', 6, 10], ['0/', 11, 13], ['|', 14, 15], ['?', 16, 17],
  ]);
  expect(transformSelectedNotes(tokens, [0, 1], 'subdivision:0').join(' ')).toBe('#4_ 6. 0/ | ?');
  expect(transformSelectedNotes(tokens, [0], 'pitch:0').join(' ')).toBe('0/// 6.// 0/ | ?');
  expect(transformSelectedNotes(tokens, [2], 'octave:up').join(' ')).toBe('#4_/// 6.// 0/ | ?');
});

test('unsupported symbols and incomplete markup never silently lose characters', () => {
  for (const text of ['1 8 2', '1____^^', '#', '1////', 'notes 123']) {
    expect(parseNoteNotation(text).error).not.toBe('');
    expect(parseNoteNotation(text).tokens).toEqual([]);
  }
});
