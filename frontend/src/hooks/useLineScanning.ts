import { useRef, useState, useEffect } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { LlmSettings, NoteLine, ScannerProject } from '../types/scanner';
import { cropImage, loadImage } from '../services/imageProcessing';
import { scanImageCrop } from '../services/scannerApi';
import { updateProjectPage } from '../services/projectPages';

export function useLineScanning(current: RefObject<ScannerProject | null>, update: Dispatch<SetStateAction<ScannerProject | null>>) {
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const cancel = () => controller.current?.abort();

  async function scanLines(pageId: string, lines: NoteLine[], settings: LlmSettings) {
    const project = current.current;
    const page = project?.pages.find(page => page.id === pageId);
    if (!project || !page || controller.current || !lines.length) return;
    const requestController = new AbortController();
    controller.current = requestController;
    setBusy(true);
    const patchLine = (line: NoteLine, patch: Partial<NoteLine>) => update(previous => {
      if (previous?.id !== project.id) return previous;
      return updateProjectPage(previous, pageId, page => ({ ...page, lines: page.lines.map(existing => existing.id === line.id && existing.revision === line.revision
        ? { ...existing, ...patch, ...(existing.edited && patch.text !== undefined ? { text: existing.text } : {}) }
        : existing) }));
    });
    let nextIndex = 0;
    try {
      const image = await loadImage(page.image.dataUrl);
      const worker = async () => {
        while (nextIndex < lines.length && !requestController.signal.aborted) {
          const line = lines[nextIndex++];
          patchLine(line, { status: 'scanning', error: undefined });
          try {
            const text = await scanImageCrop(cropImage(image, line.box), settings, requestController.signal);
            patchLine(line, { status: 'success', modelText: text, ...(!line.edited ? { text } : {}) });
          } catch (error) {
            patchLine(line, { status: 'error', error: requestController.signal.aborted ? 'Scan cancelled. Retry when ready.' : error instanceof Error ? error.message : 'Unable to scan this line.' });
          }
        }
      };
      await Promise.all([worker(), worker()]);
    } catch (error) {
      for (const line of lines) patchLine(line, { status: 'error', error: error instanceof Error ? error.message : 'Unable to load the image.' });
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }
  return { busy, cancel, scanLines };
}
