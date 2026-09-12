import { readFile } from 'node:fs/promises';
import { transcribeLine } from '../src/transcribeLine.js';

// A manually reviewed digit-only reference. Octaves, rhythm and bars are not scored.
const expected = '7 1 2 4 1 5 7 1 2 4 1 7 6 6 7 6 5 4 5 2 1 2 4 5 6 5 4 2 1 2 4 5 6 4 6 5 5 0 6 1 6 5 4 5 6 1'.split(' ');
const image = await readFile(new URL('../../../../analysis_outputs/552c8d531cf8f_row_03.png', import.meta.url));
const started = Date.now();
const text = await transcribeLine({ image: `data:image/png;base64,${image.toString('base64')}` }, new AbortController().signal)
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
const actual = text.match(/[0-7?]/g) || [];
const distance = Array.from({ length: expected.length + 1 }, () => Array<number>(actual.length + 1).fill(0));
for (let i = 0; i <= expected.length; i++) distance[i][0] = i;
for (let j = 0; j <= actual.length; j++) distance[0][j] = j;
for (let i = 1; i <= expected.length; i++) for (let j = 1; j <= actual.length; j++) {
  distance[i][j] = Math.min(distance[i - 1][j] + 1, distance[i][j - 1] + 1, distance[i - 1][j - 1] + Number(expected[i - 1] !== actual[j - 1]));
}
const errors = { substitutions: 0, omissions: 0, additions: 0 };
let i = expected.length, j = actual.length;
while (i || j) {
  if (i && j && distance[i][j] === distance[i - 1][j - 1] + Number(expected[i - 1] !== actual[j - 1])) {
    if (expected[i - 1] !== actual[j - 1]) errors.substitutions++;
    i--; j--;
  } else if (i && distance[i][j] === distance[i - 1][j] + 1) { errors.omissions++; i--; }
  else { errors.additions++; j--; }
}
console.log(JSON.stringify({ sample: '552c8d531cf8f_row_03.png', durationMs: Date.now() - started,
  expectedDigits: expected.length, returnedDigits: actual.length, ...errors,
  digitErrorRate: distance[expected.length][actual.length] / expected.length, text,
  scope: 'One crop only; octave, rhythm, and barline accuracy are not evaluated.' }, null, 2));
