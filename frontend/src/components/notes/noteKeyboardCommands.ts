export function noteKeyboardCommand(key: string, options: { alt: boolean; shift: boolean; modifier: boolean }): string | undefined {
  if (options.modifier) {
    if (key.toLowerCase() === 'z') return options.shift ? 'redo' : 'undo';
    return undefined;
  }
  if (options.alt) {
    if (key === 'ArrowUp') return 'octave:up';
    if (key === 'ArrowDown') return 'octave:down';
    return undefined;
  }
  if (/^[0-7]$/.test(key)) return `pitch:${key}`;
  if (key === '?') return 'unknown';
  if (key === '.') return 'dot';
  if (['#', 'b', 'n'].includes(key)) return `accidental:${key}`;
  if (key === 'Enter') return options.shift ? 'insert:after' : 'edit';
  if (key === 'Delete' || key === 'Backspace') return 'delete';
  return undefined;
}
