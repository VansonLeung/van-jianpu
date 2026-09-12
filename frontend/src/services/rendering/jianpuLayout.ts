import type { NotationToken } from '../noteNotation';

export type JianpuPrimitive =
  | { kind: 'text'; x: number; y: number; text: string; size: number; mark: string }
  | { kind: 'line'; x: number; y: number; x2: number; y2: number; stroke: number; mark: string }
  | { kind: 'circle'; x: number; y: number; radius: number; mark: string };
export interface JianpuGlyph { index: number; token: NotationToken; x: number; y: number; width: number; height: number; primitives: JianpuPrimitive[] }
export interface JianpuLayout { width: number; height: number; glyphs: JianpuGlyph[] }
interface Metrics { width: number; above: number; below: number; primitives: JianpuPrimitive[] }

function tokenMetrics(token: NotationToken): Metrics {
  const primitives: JianpuPrimitive[] = [];
  const text = (x: number, y: number, value: string, size = 26, mark = 'digit') => primitives.push({ kind: 'text', x, y, text: value, size, mark });
  const line = (x: number, y: number, x2: number, y2: number, stroke = 1.6, mark = 'bar') => primitives.push({ kind: 'line', x, y, x2, y2, stroke, mark });
  const dot = (x: number, y: number, mark: string) => primitives.push({ kind: 'circle', x, y, radius: 1.8, mark });
  let width = 32; let above = 27; let below = 10;
  if (token.note) {
    const n = token.note;
    const digitX = 8 + (n.accidental ? 14 : 0);
    const center = digitX + 8;
    width = digitX + 16 + (n.dotted ? 10 : 0) + 8;
    text(digitX, 0, n.pitch);
    if (n.accidental) text(5, -3, ({ '#': '♯', b: '♭', n: '♮' })[n.accidental] || '', 23, 'accidental');
    if (n.dotted) dot(digitX + 23, -9, 'rhythm-dot');
    for (let i = 0; i < Math.max(0, n.octave); i++) dot(center, -30 - i * 7, 'upper-dot');
    above = Math.max(above, 34 + (n.octave - 1) * 7);
    for (let i = 0; i < n.subdivision; i++) line(digitX, 5 + i * 4, digitX + 16, 5 + i * 4, 1.6, 'underline');
    const lowerStart = 10 + n.subdivision * 4;
    for (let i = 0; i < Math.max(0, -n.octave); i++) dot(center, lowerStart + i * 7, 'lower-dot');
    below = Math.max(below, n.subdivision * 4 + 4, n.octave < 0 ? lowerStart + (-n.octave - 1) * 7 + 5 : 0);
  } else if (token.kind === 'unknown') text(8, 0, '?');
  else if (token.kind === 'sustain') line(8, -9, 24, -9, 1.8, 'sustain');
  else {
    const repeat = token.text === '|:' || token.text === ':|';
    width = repeat ? 32 : token.text === '||' ? 22 : 18;
    if (repeat) {
      const start = token.text === '|:';
      line(start ? 7 : 24, -25, start ? 7 : 24, 6, 3);
      line(start ? 13 : 18, -25, start ? 13 : 18, 6);
      dot(start ? 23 : 8, -17, 'repeat-dot'); dot(start ? 23 : 8, -7, 'repeat-dot');
    } else {
      line(8, -25, 8, 6);
      if (token.text === '||') line(14, -25, 14, 6);
    }
  }
  return { width, above, below, primitives };
}

export function layoutJianpuTokens(tokens: NotationToken[], requestedWidth: number): JianpuLayout {
  const width = Math.max(100, requestedWidth);
  const padding = 6; const available = width - padding * 2;
  const metrics = tokens.map(tokenMetrics);
  const rows: number[][] = [];
  let row: number[] = []; let used = 0;
  for (let index = 0; index < tokens.length; index++) {
    if (row.length && used + metrics[index].width > available) {
      // Prefer the most recent completed measure over splitting the next measure.
      const boundary = row.reduce((last, i, position) => tokens[i].kind === 'bar' && tokens[i].text !== '|:' ? position : last, -1);
      if (boundary >= 0) { rows.push(row.slice(0, boundary + 1)); row = row.slice(boundary + 1); }
      else if (row.length > 1 && (tokens[row[row.length - 1]].text === '|:' || tokens[index].kind === 'bar' && tokens[index].text !== '|:')) { rows.push(row.slice(0, -1)); row = row.slice(-1); }
      else { rows.push(row); row = []; }
      used = row.reduce((sum, i) => sum + metrics[i].width, 0);
      if (row.length && used + metrics[index].width > available) { rows.push(row); row = []; used = 0; }
    }
    row.push(index); used += metrics[index].width;
  }
  if (row.length) rows.push(row);
  const glyphs: JianpuGlyph[] = [];
  let y = padding;
  for (const indexes of rows) {
    const above = Math.max(...indexes.map(i => metrics[i].above));
    const below = Math.max(...indexes.map(i => metrics[i].below));
    const height = above + below + 8;
    let x = padding;
    for (const index of indexes) {
      const m = metrics[index];
      glyphs.push({ index, token: tokens[index], x, y, width: m.width, height, primitives: m.primitives.map(p => ({ ...p, y: p.y + above + 4, ...(p.kind === 'line' ? { y2: p.y2 + above + 4 } : {}) })) });
      x += m.width;
    }
    y += height + 8;
  }
  return { width, height: Math.max(52, y - 8 + padding), glyphs };
}
