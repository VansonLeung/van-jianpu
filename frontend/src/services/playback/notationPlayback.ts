import { parseNoteNotation, type NoteAttributes, type NotationToken } from '../noteNotation';
import type { ScannerProject } from '../../types/scanner';

export interface PlaybackSettings { tonic: number; octave: number; tempo: number; volume: number; honorRepeats: boolean }
export const DEFAULT_PLAYBACK: PlaybackSettings = { tonic: 0, octave: 4, tempo: 90, volume: 65, honorRepeats: false };
export const KEY_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export interface PlaybackRequest { scope: 'project' | 'page' | 'line' | 'selection'; pageId?: string; lineId?: string; start?: number; end?: number; loop?: boolean }
export interface PlaybackMarker { pageId: string; lineId: string; tokenIndex: number; text: string; start: number; end: number; estimated: boolean }
export interface PlaybackSound { midi: number; start: number; end: number }
export interface PlaybackSequence { markers: PlaybackMarker[]; sounds: PlaybackSound[]; beats: number; warnings: string[] }
interface SourceToken { token: NotationToken; pageId: string; lineId: string; tokenIndex: number }

export function validatePlaybackSettings(value: unknown): PlaybackSettings {
  const v = value as PlaybackSettings;
  if (!v || typeof v !== 'object' || !Number.isInteger(v.tonic) || v.tonic < 0 || v.tonic > 11 || !Number.isInteger(v.octave) || v.octave < 0 || v.octave > 8
    || !Number.isFinite(v.tempo) || v.tempo < 30 || v.tempo > 240 || !Number.isFinite(v.volume) || v.volume < 0 || v.volume > 100 || typeof v.honorRepeats !== 'boolean') throw new Error('Invalid project playback settings.');
  return { tonic: v.tonic, octave: v.octave, tempo: v.tempo, volume: v.volume, honorRepeats: v.honorRepeats };
}

export function noteMidiPitch(note: NoteAttributes, settings: PlaybackSettings): number | null {
  if (note.pitch === '0') return null;
  const degree = Number(note.pitch) - 1;
  const base = (settings.octave + 1 + note.octave) * 12;
  let pitch = base + settings.tonic + [0, 2, 4, 5, 7, 9, 11][degree];
  if (note.accidental) {
    // Accidentals replace the key signature's alteration for the spelled letter.
    const tonicLetter = [0, 0, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6][settings.tonic];
    const letter = tonicLetter + degree;
    pitch = base + Math.floor(letter / 7) * 12 + [0, 2, 4, 5, 7, 9, 11][letter % 7] + (note.accidental === '#' ? 1 : note.accidental === 'b' ? -1 : 0);
  }
  if (pitch < 0 || pitch > 127) throw new Error('A note is outside MIDI range 0–127. Change the playback octave or correct its octave marks.');
  return pitch;
}

function expandRepeats(source: SourceToken[]): SourceToken[] {
  const output: SourceToken[] = [];
  let start: number | null = null;
  for (const item of source) {
    if (item.token.text === '|:') {
      if (start !== null) throw new Error('Nested repeats are not supported. Turn off Honor repeats or simplify the passage.');
      start = output.length;
    } else if (item.token.text === ':|') {
      if (start === null) throw new Error('A repeat end has no matching start in this playback range.');
      const section = output.slice(start);
      if (!section.some(item => item.token.kind === 'note' || item.token.kind === 'unknown')) throw new Error('A repeated passage must contain notes or rests.');
      output.push(...section); start = null;
    } else output.push(item);
  }
  if (start !== null) throw new Error('A repeat start has no matching end in this playback range.');
  return output;
}

export function compilePlayback(project: ScannerProject, request: PlaybackRequest, settings: PlaybackSettings): PlaybackSequence {
  const source: SourceToken[] = [];
  const warnings = new Set<string>();
  for (const page of project.pages) {
    if (request.scope !== 'project' && page.id !== request.pageId) continue;
    for (const line of page.lines) {
      if (['line', 'selection'].includes(request.scope) && line.id !== request.lineId) continue;
      const parsed = parseNoteNotation(line.text);
      if (parsed.error) throw new Error(`${page.image.name}, line ${page.lines.indexOf(line) + 1}: ${parsed.error}`);
      if (!parsed.tokens.length) warnings.add('Empty lines are skipped.');
      if (line.status === 'stale') warnings.add('Some crops changed; playback uses the current edited text.');
      parsed.tokens.forEach((token, tokenIndex) => {
        if (request.lineId === line.id && (tokenIndex < (request.start ?? 0) || tokenIndex > (request.end ?? Infinity))) return;
        source.push({ token, pageId: page.id, lineId: line.id, tokenIndex });
      });
    }
  }
  const tokens = settings.honorRepeats ? expandRepeats(source) : source;
  if (!settings.honorRepeats && source.some(item => ['|:', ':|'].includes(item.token.text))) warnings.add('Repeat bars are played once.');
  const markers: PlaybackMarker[] = [];
  const sounds: PlaybackSound[] = [];
  let beats = 0;
  let preceding: PlaybackSound | null | undefined;
  for (const { token, ...location } of tokens) {
    if (token.kind === 'bar') continue;
    const duration = token.note ? (token.note.dotted ? 1.5 : 1) / 2 ** token.note.subdivision : 1;
    if (token.kind === 'sustain') {
      if (preceding === undefined) throw new Error('A leading duration dash has no preceding note or rest in this playback range.');
      if (preceding) preceding.end += duration;
    } else {
      const midi = token.note ? noteMidiPitch(token.note, settings) : null;
      preceding = midi === null ? null : { midi, start: beats, end: beats + duration };
      if (preceding) sounds.push(preceding);
    }
    if (token.kind === 'unknown') warnings.add('? uses one silent quarter note; its timing is estimated.');
    markers.push({ ...location, text: token.text, start: beats, end: beats + duration, estimated: token.kind === 'unknown' });
    beats += duration;
  }
  if (!markers.length) throw new Error('There are no notes or rests to play in this range.');
  return { markers, sounds, beats, warnings: [...warnings] };
}

// Only musical edits invalidate playback; page selection, volume and scan status do not.
export function playbackSignature(project: ScannerProject | null): string {
  const s = project?.playback || DEFAULT_PLAYBACK;
  return JSON.stringify([project?.id, s.tonic, s.octave, s.tempo, s.honorRepeats,
    project?.pages.map(p => [p.id, p.lines.map(l => [l.id, l.text, l.revision])])]);
}
