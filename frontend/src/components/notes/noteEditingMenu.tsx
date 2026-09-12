import type { MenuProps } from 'antd';
import type { NotationToken } from '../../services/noteNotation';

export const subdivisionLabels = ['No underline (quarter)', 'One underline (eighth)', 'Two underlines (sixteenth)', 'Three underlines (thirty-second)'];
const label = (title: string, shortcut?: string, checked = false) => <span className="note-menu-label"><span>{checked ? '✓ ' : ''}{title}</span>{shortcut && <kbd>{shortcut}</kbd>}</span>;

export function getSelectionCapabilities(tokens: NotationToken[], selection: number[]) {
  const selected = selection.map(index => tokens[index]).filter(Boolean);
  const hasSelection = selected.length > 0;
  const allNotes = hasSelection && selected.every(token => token.kind === 'note');
  const allPitched = allNotes && selected.every(token => token.note!.pitch !== '0');
  const replaceable = hasSelection && selected.every(token => token.kind === 'note' || token.kind === 'unknown');
  const subdivisions = new Set(selected.map(token => token.note?.subdivision));
  return { selected, hasSelection, allNotes, allPitched, replaceable,
    subdivision: allNotes && subdivisions.size === 1 ? selected[0].note!.subdivision : null,
    mixed: allNotes && subdivisions.size > 1,
    allDotted: allNotes && selected.every(token => token.note!.dotted),
  };
}

export function subdivisionMenuItems(tokens: NotationToken[], selection: number[]): MenuProps['items'] {
  const state = getSelectionCapabilities(tokens, selection);
  return [
    ...(state.mixed ? [{ key: 'mixed-label', label: 'Mixed subdivisions', disabled: true }] : []),
    ...subdivisionLabels.map((title, index) => ({ key: `subdivision:${index}`, label: label(title, `R, ${index + 1}`, state.subdivision === index), disabled: !state.allNotes })),
  ];
}

export function noteEditingMenuItems(tokens: NotationToken[], selection: number[], canUndo: boolean, canRedo: boolean): MenuProps['items'] {
  const state = getSelectionCapabilities(tokens, selection);
  return [
    { key: 'selection-label', label: `${selection.length} ${state.replaceable ? 'note' : 'item'}${selection.length === 1 ? '' : 's'} selected`, disabled: true },
    { key: 'edit', label: label('Edit note markup…', 'Enter'), disabled: selection.length !== 1 },
    { key: 'pitch', label: 'Set digit', disabled: selection.length !== 1 || !state.replaceable,
      children: Array.from({ length: 8 }, (_, index) => ({ key: `pitch:${index}`, label: label(index === 0 ? '0 · Rest' : String(index), String(index)) })) },
    { key: 'unknown', label: label('Mark unreadable ?', '?'), disabled: !state.replaceable },
    { type: 'divider' },
    { key: 'subdivision', label: state.mixed ? 'Subdivision · Mixed' : 'Subdivision', disabled: !state.allNotes, children: subdivisionMenuItems(tokens, selection) },
    { key: 'dot', label: label(state.allDotted ? 'Remove rhythm dot' : 'Add rhythm dot', '.'), disabled: !state.allNotes },
    { key: 'octave:up', label: label('Raise octave', 'Alt/Option ↑'), disabled: !state.allPitched },
    { key: 'octave:down', label: label('Lower octave', 'Alt/Option ↓'), disabled: !state.allPitched },
    { key: 'accidental', label: 'Accidental', disabled: !state.allPitched, children: [
      { key: 'accidental:#', label: label('Sharp', '#') }, { key: 'accidental:b', label: label('Flat', 'b') },
      { key: 'accidental:n', label: label('Natural', 'n') }, { key: 'accidental:', label: 'Clear accidental' },
    ] },
    { type: 'divider' },
    { key: 'insert:before', label: 'Insert note before', disabled: !state.hasSelection },
    { key: 'insert:after', label: label('Insert note after', 'Shift Enter') },
    { key: 'duplicate', label: 'Duplicate selection', disabled: !state.hasSelection },
    { key: 'delete', label: label('Delete selection', 'Delete / Backspace'), disabled: !state.hasSelection, danger: true },
    { type: 'divider' },
    { key: 'undo', label: label('Undo', '⌘/Ctrl Z'), disabled: !canUndo },
    { key: 'redo', label: label('Redo', '⌘/Ctrl Shift Z'), disabled: !canRedo },
  ];
}
