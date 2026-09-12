import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ScannerProject } from '../../types/scanner';
import { compilePlayback, DEFAULT_PLAYBACK, playbackSignature, validatePlaybackSettings, type PlaybackMarker, type PlaybackRequest, type PlaybackSequence, type PlaybackSettings } from '../../services/playback/notationPlayback';
import { playbackMidi } from '../../services/playback/playbackMidi';
import type { ErhuAudio } from '../../services/playback/ErhuAudio';

type Status = 'stopped' | 'loading' | 'playing' | 'paused';
interface PlaybackControls {
  status: Status; settings: PlaybackSettings; position: number; duration: number; marker: PlaybackMarker | null; warnings: string[]; error: string; notice: string;
  follow: boolean; setFollow: (value: boolean) => void; auditionEnabled: boolean; setAuditionEnabled: (value: boolean) => void;
  play: (request: PlaybackRequest) => void; pause: () => void; resume: () => void; stop: () => void;
  updateSettings: (patch: Partial<PlaybackSettings>) => void; audition: (lineId: string, tokenIndex: number) => void;
}
const Context = createContext<PlaybackControls | null>(null);
export const usePlayback = () => useContext(Context)!;

export function PlaybackProvider({ project, onSettings, onFollowPage, children }: {
  project: ScannerProject | null; onSettings: (settings: PlaybackSettings) => void; onFollowPage: (pageId: string) => void; children: ReactNode;
}) {
  const settings = project?.playback || DEFAULT_PLAYBACK;
  const latest = useRef({ project, settings, onFollowPage }); latest.current = { project, settings, onFollowPage };
  const engine = useRef<ErhuAudio | null>(null);
  const initializing = useRef<Promise<ErhuAudio> | null>(null);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const auditionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingAudition = useRef<{ lineId: string; tokenIndex: number } | null>(null);
  const active = useRef<{ sequence: PlaybackSequence; tempo: number; loop: boolean } | null>(null);
  const statusRef = useRef<Status>('stopped');
  const [status, setStatus] = useState<Status>('stopped');
  const [position, setPosition] = useState(0);
  const [marker, setMarker] = useState<PlaybackMarker | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [follow, setFollow] = useState(true);
  const [auditionEnabled, setAuditionEnabled] = useState(false);
  const changeStatus = (value: Status) => { statusRef.current = value; setStatus(value); };
  function stop() {
    epoch.current++; clearTimeout(auditionTimer.current);
    engine.current?.silence(); active.current = null;
    changeStatus('stopped'); setPosition(0); setMarker(null);
  }
  const stopRef = useRef(stop); stopRef.current = stop;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; epoch.current++; clearTimeout(auditionTimer.current); engine.current?.destroy(); engine.current = null; };
  }, []);
  const signature = playbackSignature(project);
  useEffect(() => {
    if (statusRef.current !== 'stopped') setNotice('Playback stopped because the notes, order, or playback settings changed.');
    const pending = pendingAudition.current; pendingAudition.current = null;
    stopRef.current();
    if (pending) auditionTimer.current = setTimeout(() => {
      const page = latest.current.project?.pages.find(p => p.lines.some(l => l.id === pending.lineId));
      if (page) void actions.current.play({ scope: 'selection', pageId: page.id, lineId: pending.lineId, start: pending.tokenIndex, end: pending.tokenIndex });
    }, 80);
  }, [signature]);
  useEffect(() => { engine.current?.setVolume(settings.volume); }, [settings.volume]);

  function ensureEngine(): Promise<ErhuAudio> {
    if (engine.current) { void engine.current.context.resume(); return Promise.resolve(engine.current); }
    if (!initializing.current) {
      // Create and resume directly from the user's gesture, before loading the engine module.
      const context = new AudioContext();
      const resumed = context.resume();
      initializing.current = Promise.all([import('../../services/playback/ErhuAudio'), resumed])
        .then(([module]) => module.createErhuAudio(context))
        .then(value => {
          if (!mounted.current) { value.destroy(); throw new Error('Playback was closed.'); }
          engine.current = value; value.setVolume(latest.current.settings.volume); return value;
        }).catch(error => { void context.close().catch(() => {}); throw error; })
        .finally(() => { initializing.current = null; });
    }
    return initializing.current;
  }
  async function play(request: PlaybackRequest) {
    stop(); setError(''); setNotice(''); setWarnings([]);
    const current = latest.current;
    if (!current.project) return;
    const generation = epoch.current;
    try {
      const sequence = compilePlayback(current.project, request, current.settings);
      active.current = { sequence, tempo: current.settings.tempo, loop: !!request.loop };
      setWarnings(sequence.warnings); changeStatus('loading');
      const audio = await ensureEngine();
      if (generation !== epoch.current) return;
      await audio.load(playbackMidi(sequence, current.settings.tempo), !!request.loop);
      if (generation !== epoch.current) { audio.silence(); return; }
      audio.sequencer.currentTime = 0;
      audio.sequencer.play(); changeStatus('playing');
    } catch (error) {
      if (generation !== epoch.current || !mounted.current) return;
      stop(); setError(error instanceof Error ? error.message : 'Unable to start audio playback.');
    }
  }
  function pause() { if (statusRef.current !== 'playing') return; engine.current?.silence(); changeStatus('paused'); }
  async function resume() {
    if (statusRef.current !== 'paused' || !engine.current) return;
    const generation = epoch.current;
    try {
      await engine.current.context.resume();
      if (generation !== epoch.current) return;
      engine.current.sequencer.play(); changeStatus('playing');
    } catch { setError('Audio could not resume. Press Play to try again.'); stop(); }
  }
  useEffect(() => {
    if (status !== 'playing') return;
    const timer = setInterval(() => {
      const audio = engine.current; const session = active.current;
      if (!audio || !session) return;
      const time = Math.max(0, audio.sequencer.currentTime);
      const beat = time * session.tempo / 60;
      setPosition(Math.min(time, session.sequence.beats * 60 / session.tempo));
      setMarker(session.sequence.markers.find(m => m.start <= beat && m.end > beat) || null);
      if (audio.sequencer.isFinished && !session.loop) { changeStatus('stopped'); setMarker(null); }
    }, 40);
    return () => clearInterval(timer);
  }, [status]);
  useEffect(() => {
    if (!follow || !marker) return;
    if (latest.current.project?.activePageId !== marker.pageId) latest.current.onFollowPage(marker.pageId);
    const timer = setTimeout(() => document.getElementById(`note-${marker.lineId}-${marker.tokenIndex}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }), 80);
    return () => clearTimeout(timer);
  }, [follow, marker?.pageId, marker?.lineId, marker?.tokenIndex]);
  const actions = useRef({ play, pause, resume }); actions.current = { play, pause, resume };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.metaKey || event.ctrlKey) return;
      if ((event.target as HTMLElement).closest('input, textarea, button, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="combobox"], [role="slider"], [role="checkbox"]')) return;
      event.preventDefault();
      if (statusRef.current === 'playing') actions.current.pause();
      else if (statusRef.current === 'paused') void actions.current.resume();
      else if (statusRef.current !== 'loading') void actions.current.play({ scope: 'page', pageId: latest.current.project?.activePageId || undefined });
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, []);
  function audition(lineId: string, tokenIndex: number) {
    if (!auditionEnabled) return;
    pendingAudition.current = { lineId, tokenIndex };
  }
  return <Context.Provider value={{ status, settings, position, duration: active.current ? active.current.sequence.beats * 60 / active.current.tempo : 0,
    marker, warnings, error, notice, follow, setFollow, auditionEnabled, setAuditionEnabled, play: request => { void play(request); }, pause, resume: () => { void resume(); }, stop,
    updateSettings: patch => { try { onSettings(validatePlaybackSettings({ ...settings, ...patch })); } catch { /* Allow incomplete number entry without saving invalid settings. */ } }, audition }}>{children}</Context.Provider>;
}
