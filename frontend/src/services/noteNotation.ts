export interface NoteAttributes {
  pitch: string;
  accidental: string;
  octave: number;
  dotted: boolean;
  subdivision: number;
}
export interface NotationToken {
  text: string;
  start: number;
  end: number;
  kind: 'note' | 'unknown' | 'bar' | 'sustain';
  note?: NoteAttributes;
}

export function parseNoteNotation(text: string): { tokens: NotationToken[]; error: string } {
  const pattern = /\s+|\|\||\|:|:\||\||[bn#]?[0-7](?:\^+|_+)?\.?\/{0,3}|[-?]/gy;
  const tokens: NotationToken[] = [];
  let position = 0;
  while (position < text.length) {
    const match = pattern.exec(text);
    if (!match) return { tokens: [], error: `Unsupported notation near character ${position + 1}. Edit the plain text below; your text has been kept.` };
    const value = match[0];
    if (value.trim()) {
      const parts = /^([bn#]?)([0-7])(\^+|_+)?(\.?)(\/{0,3})$/.exec(value);
      tokens.push({ text: value, start: position, end: pattern.lastIndex,
        kind: parts ? 'note' : value === '?' ? 'unknown' : value === '-' ? 'sustain' : 'bar',
        ...(parts ? { note: { accidental: parts[1], pitch: parts[2], octave: (parts[3]?.length || 0) * (parts[3]?.startsWith('_') ? -1 : 1), dotted: !!parts[4], subdivision: parts[5].length } } : {}),
      });
    }
    position = pattern.lastIndex;
  }
  return { tokens, error: '' };
}

export function formatNote(note: NoteAttributes): string {
  return `${note.accidental}${note.pitch}${note.octave > 0 ? '^'.repeat(note.octave) : '_'.repeat(-note.octave)}${note.dotted ? '.' : ''}${'/'.repeat(note.subdivision)}`;
}

export function transformSelectedNotes(tokens: NotationToken[], selection: number[], command: string): string[] {
  const selected = new Set(selection);
  const allDotted = selection.every(index => tokens[index]?.note?.dotted);
  return tokens.map((token, index) => {
    if (!selected.has(index)) return token.text;
    if (command === 'unknown' && ['note', 'unknown'].includes(token.kind)) return '?';
    let note = token.note ? { ...token.note } : undefined;
    if (command.startsWith('pitch:') && ['note', 'unknown'].includes(token.kind)) {
      const pitch = command.split(':')[1];
      if (!/^[0-7]$/.test(pitch)) return token.text;
      note ??= { pitch, accidental: '', octave: 0, dotted: false, subdivision: 0 };
      note.pitch = pitch;
      if (pitch === '0') { note.accidental = ''; note.octave = 0; }
    }
    if (!note) return token.text;
    if (command.startsWith('subdivision:')) {
      const subdivision = Number(command.split(':')[1]);
      if (Number.isInteger(subdivision) && subdivision >= 0 && subdivision <= 3) note.subdivision = subdivision;
    }
    if (command === 'dot') note.dotted = !allDotted;
    if (note.pitch !== '0') {
      if (command === 'octave:up') note.octave += 1;
      if (command === 'octave:down') note.octave -= 1;
      if (command.startsWith('accidental:')) {
        const accidental = command.split(':')[1];
        if (['#', 'b', 'n', ''].includes(accidental)) note.accidental = accidental;
      }
    }
    return formatNote(note);
  });
}

export function selectionRange(anchor: number, end: number): number[] {
  return Array.from({ length: Math.abs(end - anchor) + 1 }, (_, index) => Math.min(anchor, end) + index);
}
