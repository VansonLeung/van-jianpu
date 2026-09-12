import type { ScannerPage, ScannerProject } from '../types/scanner';
import { readImageFile } from './imageProcessing';
import { MAX_PROJECT_BYTES, MAX_PROJECT_PAGES } from './projectValidation';
import { projectName } from './projectName';

export function updateProjectPage(project: ScannerProject | null, pageId: string, change: (page: ScannerPage) => ScannerPage): ScannerProject | null {
  return project && { ...project, pages: project.pages.map(page => page.id === pageId ? change(page) : page) };
}
export function reorderItems<T extends { id: string }>(items: T[], id: string, offset: number): T[] {
  const index = items.findIndex(item => item.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}
export function moveItemBefore<T extends { id: string }>(items: T[], id: string, beforeId: string): T[] {
  if (id === beforeId) return items;
  const item = items.find(item => item.id === id);
  if (!item || !items.some(item => item.id === beforeId)) return items;
  const next = items.filter(item => item.id !== id);
  next.splice(next.findIndex(item => item.id === beforeId), 0, item);
  return next;
}
export async function appendImagePages(project: ScannerProject | null, files: File[]): Promise<ScannerProject> {
  if (!files.length) throw new Error('Choose at least one image.');
  if ((project?.pages.length || 0) + files.length > MAX_PROJECT_PAGES) throw new Error(`A project can contain up to ${MAX_PROJECT_PAGES} pages.`);
  const next: ScannerProject = project ? { ...project, pages: [...project.pages] } : { version: 2, id: crypto.randomUUID(), activePageId: null, pages: [] };
  let remaining = MAX_PROJECT_BYTES - new Blob([JSON.stringify(next)]).size;
  const firstNewIndex = next.pages.length;
  // Decode sequentially, preserving file order and limiting simultaneous image buffers.
  for (const file of files) {
    let image;
    try { image = await readImageFile(file); }
    catch (error) { throw new Error(`${file.name}: ${error instanceof Error ? error.message : 'Unable to open image.'}`); }
    const page: ScannerPage = { id: crypto.randomUUID(), image, lines: [] };
    remaining -= new Blob([JSON.stringify(page)]).size + 1;
    if (remaining < 1024) throw new Error('These pages would exceed the 100 MB project limit. Import smaller images or fewer pages.');
    next.pages.push(page);
  }
  next.activePageId = next.pages[firstNewIndex].id;
  next.name = projectName(next);
  return next;
}
export function projectTranscriptionText(project: ScannerProject): string {
  return project.pages.filter(page => page.lines.length).map(page => page.lines.map(line => line.text.trim() || '?').join('\n')).join('\n\n') + '\n';
}
