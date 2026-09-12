import { Button } from 'antd';
import { usePlayback } from './PlaybackProvider';

export function NotePlaybackActions({ pageId, lineId, selection, valid }: { pageId: string; lineId: string; selection: number[]; valid: boolean }) {
  const playback = usePlayback();
  const start = Math.min(...selection); const end = Math.max(...selection);
  const disabled = !valid || !selection.length || playback.status === 'loading';
  const contiguous = selection.length === end - start + 1;
  return <div className="note-playback-actions">
    <Button size="small" disabled={disabled} onClick={() => playback.play({ scope: 'line', pageId, lineId, start })}>Play from note</Button>
    <Button size="small" disabled={disabled || !contiguous} title="Select adjacent notes to loop a passage" onClick={() => playback.play({ scope: 'selection', pageId, lineId, start, end, loop: true })}>Loop selection</Button>
  </div>;
}
