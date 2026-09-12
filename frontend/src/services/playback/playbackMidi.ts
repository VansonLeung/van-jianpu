import type { PlaybackSequence } from './notationPlayback';

const TICKS = 480;
function variableLength(value: number): number[] {
  const bytes = [value & 127];
  while ((value = Math.floor(value / 128)) > 0) bytes.unshift((value & 127) | 128);
  return bytes;
}
function uint32(value: number) { return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]; }
export function playbackMidi(sequence: PlaybackSequence, tempo: number): ArrayBuffer {
  const micros = Math.round(60_000_000 / tempo);
  const events = [
    { tick: 0, order: 0, bytes: [255, 81, 3, ...uint32(micros).slice(1)] },
    { tick: 0, order: 0, bytes: [176, 0, 8] }, // SF2 bank 8, program 110 (zero based).
    { tick: 0, order: 0, bytes: [176, 32, 0] },
    { tick: 0, order: 0, bytes: [192, 110] },
    { tick: 0, order: 0, bytes: [176, 91, 0] },
    { tick: 0, order: 0, bytes: [176, 93, 0] },
    { tick: 0, order: 0, bytes: [255, 6, 9, ...Array.from('loopstart', c => c.charCodeAt(0))] },
  ];
  for (const sound of sequence.sounds) {
    events.push({ tick: Math.round(sound.start * TICKS), order: 2, bytes: [144, sound.midi, 90] });
    events.push({ tick: Math.round(sound.end * TICKS), order: 1, bytes: [128, sound.midi, 0] });
  }
  // A controller at the endpoint preserves trailing/all-rest duration in MIDI readers.
  events.push({ tick: Math.round(sequence.beats * TICKS), order: 3, bytes: [176, 123, 0] });
  events.push({ tick: Math.round(sequence.beats * TICKS), order: 4, bytes: [255, 6, 7, ...Array.from('loopend', c => c.charCodeAt(0))] });
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const track: number[] = [];
  let last = 0;
  for (const event of events) { track.push(...variableLength(event.tick - last), ...event.bytes); last = event.tick; }
  track.push(0, 255, 47, 0);
  return new Uint8Array([77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, TICKS >> 8, TICKS & 255, 77, 84, 114, 107, ...uint32(track.length), ...track]).buffer;
}
