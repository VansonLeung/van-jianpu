import { useMemo } from 'react';
import { Alert, Button, Empty, Popconfirm, Popover, Tag } from 'antd';
import { QuestionCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import type { NoteLine } from '../types/scanner';
import { cropImage } from '../services/imageProcessing';
import { statusColors, statusLabels } from './lineStatus';
import { NoteTranscriptionEditor } from './notes/NoteTranscriptionEditor';
import { usePlayback } from './playback/PlaybackProvider';

interface Props {
  pageId: string;
  image: HTMLImageElement; lines: NoteLine[]; selectedId: string | null; busy: boolean;
  onSelect: (id: string) => void; onEdit: (id: string, text: string) => void;
  onScan: (line: NoteLine) => void; onUseModel: (id: string) => void;
}

function LineEditor({ pageId, image, line, index, selected, busy, onSelect, onEdit, onScan, onUseModel }: {
  pageId: string;
  image: HTMLImageElement; line: NoteLine; index: number; selected: boolean; busy: boolean;
  onSelect: () => void; onEdit: (text: string) => void; onScan: () => void; onUseModel: () => void;
}) {
  const playback = usePlayback();
  const preview = useMemo(() => {
    try { return { url: cropImage(image, line.box), error: '' }; }
    catch (error) { return { url: '', error: error instanceof Error ? error.message : 'Cannot preview this crop.' }; }
  }, [image, line.box]);
  return <article className={`result-card ${selected ? 'selected' : ''}`} id={`result-${line.id}`} onClick={onSelect}>
    <div className="result-heading"><strong>Line {index + 1}</strong><Tag color={statusColors[line.status]}>{statusLabels[line.status]}</Tag>
      <Button size="small" type="text" aria-label={`Play line ${index + 1}`} disabled={!line.text.trim() || playback.status === 'loading'} onClick={() => playback.play({ scope: 'line', pageId, lineId: line.id })}>Play</Button>
      <Button size="small" type="text" icon={<ReloadOutlined />} aria-label={`Scan line ${index + 1}`} disabled={busy || !!preview.error} onClick={onScan}>Scan</Button>
    </div>
    {preview.url ? <a className="crop-preview" href={preview.url} target="_blank" rel="noreferrer" title="Open crop at full size"><img src={preview.url} alt={`Crop for line ${index + 1}`} /></a> : <Alert title={preview.error} type="error" />}
    <NoteTranscriptionEditor pageId={pageId} lineId={line.id} lineNumber={index + 1} text={line.text} selected={selected} onChange={onEdit} />
    <div className="result-meta"><span>{line.edited ? 'Manually edited' : 'Model transcription'}{line.text.includes('?') ? ' · Contains unreadable notes' : ''}</span></div>
    {line.status === 'stale' && <Alert type="warning" title="The crop changed. Scan again to update the transcription." />}
    {line.error && <Alert type="error" title={line.error} />}
    {line.edited && line.modelText && line.modelText !== line.text && <div className="model-suggestion">
      <span>Latest model result</span><code>{line.modelText}</code>
      <Popconfirm title="Replace your edited text with the model result?" onConfirm={onUseModel} okText="Replace" disabled={busy}><Button size="small" disabled={busy}>Use model result</Button></Popconfirm>
    </div>}
  </article>;
}

export function ResultsEditor({ pageId, image, lines, selectedId, busy, onSelect, onEdit, onScan, onUseModel }: Props) {
  return <aside className="results-panel" id="transcription-panel">
    <div className="panel-heading"><span>Transcription</span><Popover title="Text notation" content={<div className="notation-help">
      <p><code>1–7</code> notes · <code>0</code> rest · <code>?</code> unreadable</p>
      <p><code>1^</code> high octave · <code>1_</code> low octave</p>
      <p><code>#4 b7 n4</code> sharp, flat, natural</p>
      <p><code>1/</code> eighth · <code>1//</code> sixteenth · <code>1.</code> dotted</p>
      <p><code>-</code> sustain · <code>| || |: :|</code> bars</p>
      <p>Verify digits first, then octave and rhythm marks.</p>
    </div>}><Button type="text" size="small" aria-label="Notation help" icon={<QuestionCircleOutlined />} /></Popover></div>
    <div className="results-list">
      {!lines.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Crops and editable notes appear here" />}
      {lines.map((line, index) => <LineEditor key={line.id} pageId={pageId} image={image} line={line} index={index}
        selected={line.id === selectedId} busy={busy} onSelect={() => onSelect(line.id)}
        onEdit={text => onEdit(line.id, text)} onScan={() => onScan(line)} onUseModel={() => onUseModel(line.id)} />)}
    </div>
  </aside>;
}
