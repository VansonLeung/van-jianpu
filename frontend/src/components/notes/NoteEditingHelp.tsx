export function NoteEditingHelp() {
  return <div className="note-shortcut-help">
    <p>Click a note; Shift-click or drag to select a range. Cmd/Ctrl-click toggles individual notes.</p>
    <dl>
      <dt>← / → · Shift ← / →</dt><dd>Move / extend selection</dd>
      <dt>Home / End</dt><dd>First / last item</dd>
      <dt>0–7 · ?</dt><dd>Set one digit / mark unreadable</dd>
      <dt>R, then 1 / 2 / 3 / 4</dt><dd>Set 0 / 1 / 2 / 3 underlines</dd>
      <dt>Alt/Option ↑ / ↓</dt><dd>Raise / lower octave</dd>
      <dt># · b · n · .</dt><dd>Sharp / flat / natural / rhythm dot</dd>
      <dt>Enter · Shift Enter</dt><dd>Edit markup / insert after</dd>
      <dt>Delete / Backspace</dt><dd>Delete selection</dd>
      <dt>Cmd/Ctrl Z · Cmd/Ctrl Shift Z</dt><dd>Undo / redo</dd>
      <dt>F8 · Shift F8</dt><dd>Next / previous ? in this line</dd>
      <dt>Shift F10</dt><dd>Open note actions</dd>
      <dt>Esc</dt><dd>Close picker / clear selection</dd>
    </dl>
    <p>Note commands apply only in the note controls. Plain text retains normal typing and its browser context menu. Undo history lasts for this page session.</p>
  </div>;
}
