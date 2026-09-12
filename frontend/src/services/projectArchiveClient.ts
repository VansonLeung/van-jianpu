import type { ScannerProject } from '../types/scanner';

function runWorker<T>(input: { project: ScannerProject } | { bytes: Uint8Array }, transfer: Transferable[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./projectArchive.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<{ result: T; error?: string }>) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message || 'Unable to process this project.')); };
    worker.onmessageerror = () => { worker.terminate(); reject(new Error('Unable to read the project worker response.')); };
    try { worker.postMessage(input, transfer); }
    catch (error) { worker.terminate(); reject(error); }
  });
}
export const exportProject = (project: ScannerProject) => runWorker<Uint8Array<ArrayBuffer>>({ project });
export async function readProjectFile(file: File): Promise<ScannerProject> {
  const buffer = await file.arrayBuffer();
  return runWorker<ScannerProject>({ bytes: new Uint8Array(buffer) }, [buffer]);
}
