import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib';
import workletUrl from 'spessasynth_lib/dist/spessasynth_processor.min.js?url';
import soundfontUrl from '../../../assets/FS_Erhu_v2.sf2?url';

export async function createErhuAudio(context: AudioContext) {
  let synth: WorkletSynthesizer | undefined;
  try {
    const response = await fetch(soundfontUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Could not load the Erhu soundfont (${response.status}).`);
    const bank = await response.arrayBuffer();
    await context.audioWorklet.addModule(workletUrl);
    synth = new WorkletSynthesizer(context);
    synth.setLogLevel(false, false, false);
    await synth.isReady;
    await synth.soundBankManager.addSoundBank(bank, 'erhu');
    if (!synth.presetList.some(p => p.bankMSB === 8 && p.program === 110)) throw new Error('The Erhu preset (bank 8, program 110) was not found.');
    const gain = context.createGain();
    gain.gain.value = 0;
    synth.connect(gain); gain.connect(context.destination);
    const sequencer = new Sequencer(synth, { skipToFirstNoteOn: false });
    sequencer.eventHandler.timeDelay = 0;
    const engine = synth;
    let pendingLoad = Promise.resolve();
    return {
      context, sequencer,
      setVolume(value: number) { gain.gain.setTargetAtTime(value / 100, context.currentTime, 0.01); },
      silence() { sequencer.pause(); engine.stopAll(true); },
      load(binary: ArrayBuffer, loop: boolean) {
        const task = pendingLoad.then(async () => {
          sequencer.loopCount = 0;
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => { clearTimeout(timeout); sequencer.eventHandler.removeEvent('songChange', 'load'); sequencer.eventHandler.removeEvent('midiError', 'load'); };
            const timeout = setTimeout(() => { cleanup(); reject(new Error('Playback preparation timed out. Try again.')); }, 10_000);
            sequencer.eventHandler.addEvent('songChange', 'load', () => { cleanup(); resolve(); });
            sequencer.eventHandler.addEvent('midiError', 'load', error => { cleanup(); reject(error); });
            sequencer.loadNewSongList([{ binary, fileName: 'transcription.mid' }]);
            sequencer.pause();
          });
          // Set after loading: the engine resets loops for very short sequences.
          sequencer.loopCount = loop ? Infinity : 0;
        });
        pendingLoad = task.catch(() => {});
        return task;
      },
      destroy() { sequencer.pause(); engine.stopAll(true); engine.destroy(); gain.disconnect(); void context.close(); },
    };
  } catch (error) { synth?.destroy(); void context.close(); throw error; }
}
export type ErhuAudio = Awaited<ReturnType<typeof createErhuAudio>>;
