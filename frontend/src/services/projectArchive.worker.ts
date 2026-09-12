import { decodeProjectFile, encodeProjectArchive } from './projectArchive';
import type { ScannerProject } from '../types/scanner';

self.onmessage = (event: MessageEvent<{ project: ScannerProject } | { bytes: Uint8Array }>) => {
  try {
    if ('project' in event.data) {
      const bytes = encodeProjectArchive(event.data.project);
      self.postMessage({ result: bytes }, { transfer: [bytes.buffer] });
    } else self.postMessage({ result: decodeProjectFile(event.data.bytes) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Unable to process this project.' });
  }
};
