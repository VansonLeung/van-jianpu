import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Alert, Button, Checkbox, Dropdown, Input, Modal, Popover, Tooltip } from 'antd';
import { MoreOutlined, RedoOutlined, UndoOutlined } from '@ant-design/icons';
import { parseNoteNotation, selectionRange, transformSelectedNotes } from '../../services/noteNotation';
import { useNoteEditingHistory } from '../../hooks/useNoteEditingHistory';
import { getSelectionCapabilities, noteEditingMenuItems, subdivisionMenuItems } from './noteEditingMenu';
import { noteKeyboardCommand } from './noteKeyboardCommands';
import { NoteEditingHelp } from './NoteEditingHelp';
import { NoteMenuPopup } from './NoteMenuPopup';
import { usePlayback } from '../playback/PlaybackProvider';
import { NotePlaybackActions } from '../playback/NotePlaybackActions';
import { JianpuLinePreview } from './JianpuLinePreview';

interface Props { pageId: string; lineId: string; lineNumber: number; text: string; selected: boolean; onChange: (text: string) => void }
interface MarkupEdit { index: number; value: string; source: string; error: string }

export function NoteTranscriptionEditor({ pageId, lineId, lineNumber, text, selected, onChange }: Props) {
  const playback = usePlayback();
  const parsed = useMemo(() => parseNoteNotation(text), [text]);
  const tokens = parsed.tokens;
  const history = useNoteEditingHistory(text, onChange, lineId);
  const selection = history.selection.filter(index => index >= 0 && index < tokens.length);
  const state = getSelectionCapabilities(tokens, selection);
  const view = useRef<HTMLDivElement>(null);
  const previewView = useRef<HTMLDivElement>(null);
  const activeView = useRef<'tokens' | 'preview'>('tokens');
  const [previewOverride, setPreviewOverride] = useState<boolean | null>(null);
  const showPreview = previewOverride ?? selected;
  const plainText = useRef<HTMLDivElement>(null);
  const anchor = useRef(0);
  const cursor = useRef(0);
  const dragging = useRef(false);
  const [contextOpen, updateContextOpen] = useState(false);
  const [contextOpening, setContextOpening] = useState(0);
  const [actionsOpen, updateActionsOpen] = useState(false);
  const [actionsOpening, setActionsOpening] = useState(0);
  // AntD caches hidden popup contents. A fresh key restores keyboard focus on
  // every opening, even if the cached popup never received its closed props.
  const setContextOpen = (open: boolean) => { if (open) setContextOpening(n => n + 1); updateContextOpen(open); };
  const setActionsOpen = (open: boolean) => { if (open) setActionsOpening(n => n + 1); updateActionsOpen(open); };
  const [rhythmOpen, setRhythmOpen] = useState(false);
  const [advance, setAdvance] = useState(false);
  const [markupEdit, setMarkupEdit] = useState<MarkupEdit | null>(null);
  useEffect(() => {
    const finish = () => { dragging.current = false; };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
    return () => { window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); window.removeEventListener('blur', finish); };
  }, []);
  const focusView = () => (activeView.current === 'preview' && previewView.current ? previewView.current : view.current)?.focus({ preventScroll: true });
  function select(index: number, extend = false, toggle = false) {
    cursor.current = index;
    let next: number[];
    if (extend) next = selectionRange(Math.min(anchor.current, tokens.length - 1), index);
    else {
      anchor.current = index;
      next = toggle ? selection.includes(index) ? selection.filter(value => value !== index) : [...selection, index].sort((a, b) => a - b) : [index];
    }
    history.setSelection(next);
    const textarea = plainText.current?.querySelector('textarea');
    if (textarea && next.length) textarea.setSelectionRange(tokens[Math.min(...next)].start, tokens[Math.max(...next)].end);
  }
  function commit(values: string[], nextSelection = selection) {
    history.commit(values.join(' '), nextSelection);
    if (nextSelection.length) { anchor.current = nextSelection[0]; cursor.current = nextSelection[nextSelection.length - 1]; }
  }
  function command(key: string) {
    setContextOpen(false);
    setActionsOpen(false);
    setRhythmOpen(false);
    focusView();
    if (key === 'undo') { history.undo(); return; }
    if (key === 'redo') { history.redo(); return; }
    if (parsed.error) return;
    if (key === 'edit') {
      if (selection.length === 1) setMarkupEdit({ index: selection[0], value: tokens[selection[0]].text, source: text, error: '' });
      return;
    }
    const values = tokens.map(token => token.text);
    if (key.startsWith('insert:')) {
      if (key === 'insert:before' && !selection.length) return;
      const index = !selection.length ? tokens.length : key === 'insert:before' ? Math.min(...selection) : Math.max(...selection) + 1;
      values.splice(index, 0, '?');
      commit(values, [index]);
      return;
    }
    if (!selection.length) return;
    if (key === 'delete') {
      const remaining = values.filter((_, index) => !selection.includes(index));
      commit(remaining, remaining.length ? [Math.min(Math.min(...selection), remaining.length - 1)] : []);
      return;
    }
    if (key === 'duplicate') {
      const index = Math.max(...selection) + 1;
      values.splice(index, 0, ...selection.map(item => values[item]));
      commit(values, selectionRange(index, index + selection.length - 1));
      return;
    }
    if (key.startsWith('pitch:') && (selection.length !== 1 || !state.replaceable)) return;
    if (key === 'unknown' && !state.replaceable) return;
    if ((key.startsWith('subdivision:') || key === 'dot') && !state.allNotes) return;
    if ((key.startsWith('octave:') || key.startsWith('accidental:')) && !state.allPitched) return;
    const next = transformSelectedNotes(tokens, selection, key);
    const nextSelection = advance && key.startsWith('pitch:') ? [Math.min(selection[0] + 1, tokens.length - 1)] : selection;
    commit(next, nextSelection);
    if (selection.length === 1 && next[selection[0]] !== tokens[selection[0]].text && parseNoteNotation(next[selection[0]]).tokens[0]?.kind === 'note') playback.audition(lineId, selection[0]);
  }
  function moveToUnknown(backward: boolean) {
    const start = selection.length ? selection.includes(cursor.current) ? cursor.current : selection[selection.length - 1] : backward ? 0 : -1;
    for (let step = 1; step <= tokens.length; step++) {
      const index = (start + (backward ? -step : step) + tokens.length * 2) % tokens.length;
      if (tokens[index].kind === 'unknown') { select(index); focusView(); return; }
    }
  }
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (event.nativeEvent.isComposing || target.closest('input, textarea, [contenteditable="true"], [role="menu"]')) return;
    const modifier = event.metaKey || event.ctrlKey;
    if (rhythmOpen) {
      if (/^[1-4]$/.test(event.key) && !modifier && !event.altKey) { event.preventDefault(); command(`subdivision:${Number(event.key) - 1}`); }
      else if (event.key === 'Escape') { event.preventDefault(); setRhythmOpen(false); focusView(); }
      else if (/^[0-9a-z]$/i.test(event.key) && !modifier) event.preventDefault();
      return;
    }
    if (event.key === 'F10' && event.shiftKey) { event.preventDefault(); setActionsOpen(false); setContextOpen(true); return; }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (contextOpen || actionsOpen) { setContextOpen(false); setActionsOpen(false); focusView(); }
      else history.setSelection([]);
      return;
    }
    if (event.key === 'F8') { event.preventDefault(); moveToUnknown(event.shiftKey); return; }
    if (event.key.toLowerCase() === 'r' && !modifier && !event.altKey) { event.preventDefault(); if (state.allNotes) setRhythmOpen(true); return; }
    if (!modifier && !event.altKey && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!tokens.length) return;
      const current = selection.includes(cursor.current) ? cursor.current : selection[selection.length - 1];
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tokens.length - 1 : !selection.length ? 0 : Math.max(0, Math.min(tokens.length - 1, current + (event.key === 'ArrowLeft' ? -1 : 1)));
      select(next, event.shiftKey && selection.length > 0);
      return;
    }
    if (modifier && event.key.toLowerCase() === 'a') { event.preventDefault(); if (tokens.length) { anchor.current = 0; cursor.current = tokens.length - 1; history.setSelection(selectionRange(0, tokens.length - 1)); } return; }
    const action = noteKeyboardCommand(event.key, { alt: event.altKey, shift: event.shiftKey, modifier });
    if (action) { event.preventDefault(); if (!event.repeat || !action.startsWith('pitch:')) command(action); }
  }
  const menu = { items: noteEditingMenuItems(tokens, selection, history.canUndo, history.canRedo), subMenuOpenDelay: 0, subMenuCloseDelay: 0.25,
    motion: { motionAppear: false, motionEnter: false, motionLeave: false }, onClick: ({ key }: { key: string }) => command(key) };
  return <div className="note-editor" onKeyDown={handleKeyDown}>
    <div className="note-editor-toolbar">
      <strong>Notes</strong><span className="note-selection-count">{selection.length ? `${selection.length} selected` : `${tokens.filter(token => token.kind === 'note' || token.kind === 'unknown').length} notes`}</span>
      <Tooltip title="Undo note edit"><Button size="small" type="text" aria-label={`Undo note edit for line ${lineNumber}`} icon={<UndoOutlined />} disabled={!history.canUndo} onClick={() => command('undo')} /></Tooltip>
      <Tooltip title="Redo note edit"><Button size="small" type="text" aria-label={`Redo note edit for line ${lineNumber}`} icon={<RedoOutlined />} disabled={!history.canRedo} onClick={() => command('redo')} /></Tooltip>
      <Dropdown menu={{ ...menu, 'aria-label': 'Note actions' }} trigger={['click']} open={actionsOpen} onOpenChange={setActionsOpen} transitionName=""
        popupRender={node => <NoteMenuPopup key={actionsOpening} open={actionsOpen}>{node}</NoteMenuPopup>}><Button size="small" type="text" aria-label={`Note actions for line ${lineNumber}`} icon={<MoreOutlined />} /></Dropdown>
    </div>
    <div className="jianpu-preview-toggle"><Checkbox checked={showPreview} aria-label={`Show Jianpu preview for line ${lineNumber}`} onChange={event => setPreviewOverride(event.target.checked)}>Jianpu preview</Checkbox></div>
    {parsed.error ? <Alert type="warning" title={parsed.error} /> : <>
      <div className="note-attribute-toolbar">
        <Dropdown menu={{ items: subdivisionMenuItems(tokens, selection), onClick: ({ key }) => command(key) }} trigger={['click']} open={rhythmOpen} onOpenChange={setRhythmOpen} transitionName="">
          <Button size="small" disabled={!state.allNotes} aria-label={`Subdivision for line ${lineNumber}`}>{state.mixed ? 'Subdivision: Mixed' : state.subdivision !== null ? `Underlines: ${state.subdivision}` : 'Subdivision'} <kbd>R</kbd></Button>
        </Dropdown>
        <Tooltip title="Toggle rhythm dot (.)"><Button size="small" disabled={!state.allNotes} aria-label={`Rhythm dot for line ${lineNumber}`} aria-pressed={state.allDotted} onClick={() => command('dot')}>Dotted</Button></Tooltip>
        <Button size="small" onClick={() => command('insert:after')} aria-label={`Insert note after for line ${lineNumber}`}>+ Note</Button>
      </div>
      {rhythmOpen && <span className="rhythm-picker-hint" role="status">Press 1–4: no underline, eighth, sixteenth, thirty-second. Esc cancels.</span>}
      <Dropdown menu={{ ...menu, 'aria-label': 'Note context menu' }} trigger={['contextMenu']} open={contextOpen} onOpenChange={setContextOpen} transitionName=""
        popupRender={node => <NoteMenuPopup key={contextOpening} open={contextOpen}>{node}</NoteMenuPopup>}>
        <div className="note-interactive-views">
        {showPreview && <JianpuLinePreview tokens={tokens} lineId={lineId} lineNumber={lineNumber} selection={selection}
          playingIndex={playback.marker?.lineId === lineId ? playback.marker.tokenIndex : null} viewRef={previewView} onFocus={() => { activeView.current = 'preview'; }}
          onPointerDown={(index, event) => {
            if (event.button !== 0) return;
            event.preventDefault(); activeView.current = 'preview'; focusView(); select(index, event.shiftKey, event.metaKey || event.ctrlKey); dragging.current = !event.metaKey && !event.ctrlKey;
          }} onPointerEnter={(index, event) => { if (dragging.current && event.buttons === 1) select(index, true); }}
          onSelect={index => { activeView.current = 'preview'; select(index); focusView(); }}
          onContextMenu={index => { activeView.current = 'preview'; if (!selection.includes(index)) select(index); cursor.current = index; }} />}
        <div className="note-token-list" ref={view} role="listbox" aria-label={`Notes for line ${lineNumber}`} aria-multiselectable="true" tabIndex={0} onFocus={() => { activeView.current = 'tokens'; }}
          aria-activedescendant={selection.length ? `note-${lineId}-${selection.includes(cursor.current) ? cursor.current : selection[0]}` : undefined}>
          {!tokens.length && <span className="note-empty">Scan a line or insert a note to start.</span>}
          {tokens.map((token, index) => <button key={index} id={`note-${lineId}-${index}`} type="button" role="option" tabIndex={-1}
            aria-label={`${token.kind === 'note' || token.kind === 'unknown' ? 'Note' : 'Symbol'} ${index + 1}: ${token.text}`} aria-selected={selection.includes(index)}
            aria-current={playback.marker?.lineId === lineId && playback.marker.tokenIndex === index ? 'true' : undefined}
            className={`note-token token-${token.kind} ${selection.includes(index) ? 'is-selected' : ''} ${playback.marker?.lineId === lineId && playback.marker.tokenIndex === index ? 'is-playing' : ''}`}
            onPointerDown={event => {
              if (event.button !== 0) return;
              event.preventDefault(); activeView.current = 'tokens'; focusView();
              select(index, event.shiftKey, event.metaKey || event.ctrlKey);
              dragging.current = !event.metaKey && !event.ctrlKey;
            }}
            onPointerEnter={event => { if (dragging.current && event.buttons === 1) select(index, true); }}
            onClick={event => { if (event.detail === 0) { activeView.current = 'tokens'; select(index); focusView(); } }}
            onContextMenu={() => { activeView.current = 'tokens'; if (!selection.includes(index)) select(index); cursor.current = index; }}>
            {token.text}
          </button>)}
        </div>
        </div>
      </Dropdown>
      <NotePlaybackActions pageId={pageId} lineId={lineId} selection={selection} valid={!parsed.error} />
      <div className="note-editor-options"><Checkbox checked={advance} onChange={event => setAdvance(event.target.checked)}>Advance after digit correction</Checkbox>
        <Popover title="Note editing shortcuts" content={<NoteEditingHelp />} trigger="click"><Button size="small" type="link">Shortcuts</Button></Popover>
      </div>
    </>}
    <div className="plain-text-editor" ref={plainText}>
      <label htmlFor={`transcription-${lineId}`}>Plain text</label>
      <Input.TextArea id={`transcription-${lineId}`} aria-label={`Transcription for line ${lineNumber}`} value={text}
        onChange={event => history.commit(event.target.value, [], true)}
        onSelect={event => {
          const textarea = event.target as HTMLTextAreaElement;
          if (document.activeElement !== textarea) return;
          const matching = tokens.flatMap((token, index) => token.start < textarea.selectionEnd && token.end > textarea.selectionStart ? [index] : []);
          history.setSelection(matching);
          if (matching.length) { anchor.current = matching[0]; cursor.current = matching[matching.length - 1]; }
        }}
        autoSize={{ minRows: 2, maxRows: 10 }} placeholder="Transcription will appear here. You can also type notes." spellCheck={false} />
    </div>
    <Modal title="Edit note markup" open={!!markupEdit} okText="Apply" onCancel={() => { setMarkupEdit(null); focusView(); }}
      afterOpenChange={open => { if (open) document.getElementById(`note-markup-${lineId}`)?.focus(); }}
      onOk={() => {
        if (!markupEdit) return;
        if (markupEdit.source !== text) { setMarkupEdit({ ...markupEdit, error: 'The transcription changed while this dialog was open. Close it and select the note again.' }); return; }
        const result = parseNoteNotation(markupEdit.value);
        if (result.error || result.tokens.length !== 1) { setMarkupEdit({ ...markupEdit, error: 'Enter exactly one valid note or symbol, such as #4_// or ?.' }); return; }
        const values = tokens.map(token => token.text);
        values[markupEdit.index] = result.tokens[0].text;
        if (result.tokens[0].kind === 'note' && result.tokens[0].text !== tokens[markupEdit.index].text) playback.audition(lineId, markupEdit.index);
        commit(values, [markupEdit.index]); setMarkupEdit(null); focusView();
      }}>
      <Input id={`note-markup-${lineId}`} aria-label="Note markup" value={markupEdit?.value || ''} onChange={event => markupEdit && setMarkupEdit({ ...markupEdit, value: event.target.value, error: '' })} />
      {markupEdit?.error && <Alert type="error" title={markupEdit.error} />}
    </Modal>
  </div>;
}
