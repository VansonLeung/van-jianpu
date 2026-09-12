import { Button, Checkbox, InputNumber, Select } from 'antd';
import { PauseOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { KEY_NAMES } from '../../services/playback/notationPlayback';
import { usePlayback } from './PlaybackProvider';

const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${(Math.floor(seconds * 10) % 600 / 10).toFixed(1).padStart(4, '0')}`;
export function PlaybackToolbar({ pageId, available }: { pageId?: string; available: boolean }) {
  const p = usePlayback();
  return <div className="playback-toolbar" aria-label="Erhu playback">
    <div className="playback-controls">
      <strong>Erhu</strong>
      {p.status === 'playing' ? <Button size="small" aria-label="Pause" icon={<PauseOutlined />} onClick={p.pause}>Pause</Button>
        : p.status === 'paused' ? <Button size="small" aria-label="Resume" icon={<PlayCircleOutlined />} onClick={p.resume}>Resume</Button>
        : <Button size="small" aria-label="Play page" icon={<PlayCircleOutlined />} loading={p.status === 'loading'} disabled={!available} onClick={() => p.play({ scope: 'page', pageId })}>Play page</Button>}
      <Button size="small" disabled={!available || p.status === 'loading'} onClick={() => p.play({ scope: 'project' })}>Play project</Button>
      <Button size="small" aria-label="Stop" icon={<StopOutlined />} disabled={p.status === 'stopped'} onClick={p.stop}>Stop</Button>
      <span className="playback-position" aria-label="Playback position">{timeLabel(p.position)} / {timeLabel(p.duration)}</span>
      <span className="playback-state" role="status" aria-label="Playback status">{p.status === 'loading' ? 'Loading Erhu…' : p.status === 'playing' ? p.marker?.estimated ? 'Playing · ? timing estimated' : 'Playing' : p.status === 'paused' ? 'Paused' : 'Stopped'}</span>
    </div>
    <div className="playback-settings">
      <label>1 = <Select size="small" aria-label="Playback key" value={p.settings.tonic} onChange={tonic => p.updateSettings({ tonic })} options={KEY_NAMES.map((label, value) => ({ label, value }))} /></label>
      <label>Octave <InputNumber size="small" aria-label="Playback octave" min={0} max={8} precision={0} value={p.settings.octave} onChange={octave => { if (octave !== null) p.updateSettings({ octave }); }} /></label>
      <label>♩/min <InputNumber size="small" aria-label="Playback tempo" min={30} max={240} value={p.settings.tempo} onChange={tempo => { if (tempo !== null) p.updateSettings({ tempo }); }} /></label>
      <label>Volume <input type="range" aria-label="Playback volume" min={0} max={100} value={p.settings.volume} onChange={event => p.updateSettings({ volume: Number(event.target.value) })} /></label>
      <Checkbox checked={p.settings.honorRepeats} onChange={e => p.updateSettings({ honorRepeats: e.target.checked })}>Honor repeats</Checkbox>
      <Checkbox checked={p.follow} onChange={e => p.setFollow(e.target.checked)}>Follow notes</Checkbox>
      <Checkbox checked={p.auditionEnabled} onChange={e => p.setAuditionEnabled(e.target.checked)}>Audition corrections</Checkbox>
    </div>
    {p.error && <div className="playback-error" role="alert">{p.error}</div>}
    {!!p.warnings.length && <div className="playback-warning">{p.warnings.join(' ')}</div>}
    {p.notice && <div className="playback-notice">{p.notice}</div>}
  </div>;
}
