export const transcriptionPrompt = `You transcribe a cropped line of Jianpu (numbered musical notation).
Read visible musical notes strictly from left to right. Accurate digits 0 through 7, including every repeated digit and rest 0, are the highest priority. Never repair the music, fill in missing measures, or infer a note from musical expectations.
Ignore lyrics, titles, Chinese dynamics such as 弱/更弱/强/中弱, fingering, rehearsal labels, tempo and key/time signatures. Do not mistake these for notes. A tightly packed group such as 6765 is four notes: 6 7 6 5.
Use exactly this whitespace-separated plain text format:
- Notes 1 2 3 4 5 6 7; rest 0.
- Unreadable note: ? as a standalone token with spaces around it. Never guess an unreadable digit.
- Octave dots above: ^ after the digit, repeated for multiple octaves (1^, 1^^).
- Octave dots below: _ after the digit, repeated for multiple octaves (1_, 1__). Dots below underlines still indicate low octave; do not confuse underlines with dots.
- Accidental prefixes: #4, b7, n4 for sharp, flat, natural.
- A rhythm dot to the right: . after digit and octave, e.g. 1_.
- Underline subdivisions: / for one underline, // for two, /// for three, applied to EACH note (6_// 7_// 6_// 5_//). No suffix for a note without an underline.
- Duration extension: - as its own token.
- Barlines: | or ||. Repeat bars: |: and :|.
- Example: #4^/ 5_/ ? 0 | 1 - - - ||
Include rhythms only when visible. Do not sacrifice digit accuracy to interpret rhythm. Ignore slurs, ornaments and performance marks in this version. Do not insert guessed symbols at the crop boundary. Output ONLY the transcription, with no prose, Markdown or JSON. If the entire crop is unreadable, output ?.`;

export function normalizeTranscription(content: string): string {
  const text = content.trim().replace(/^```(?:text|plaintext)?\s*\n?([\s\S]*?)\n?```$/i, '$1')
    .trim();
  const invalid = () => {
    throw new Error('The model returned an unsupported notation format. Retry this line or edit it manually.');
  };
  if (!text || text.length > 12000) invalid();
  // Some models group adjacent digits despite the prompt. Tokenize without dropping
  // any characters; prose or unsupported symbols must never be silently discarded.
  const token = /\s+|\|\||\|:|:\||\||[bn#]?[0-7](?:\^+|_+)?\.?\/{0,3}|[-?]/gy;
  const tokens: string[] = [];
  let position = 0;
  while (position < text.length) {
    const match = token.exec(text);
    if (!match) invalid();
    const value = match![0].trim();
    if (value) tokens.push(value);
    position = token.lastIndex;
  }
  if (!tokens.length) invalid();
  return tokens.join(' ');
}
