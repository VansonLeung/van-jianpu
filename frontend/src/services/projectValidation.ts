import type { ImageSource, NoteLine, ScannerPage, ScannerProject } from '../types/scanner';
import { validatePlaybackSettings } from './playback/notationPlayback';

export const MAX_PROJECT_BYTES = 100 * 1024 * 1024;
export const MAX_PROJECT_PAGES = 100;
function invalid(): never { throw new Error('This is not a valid Jianpu Scanner project.'); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function validateImage(value: unknown): ImageSource {
  const image = record(value);
  if (typeof image.name !== 'string' || typeof image.dataUrl !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(image.dataUrl)) invalid();
  const { width, height } = image;
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 40_000_000) invalid();
  return { name: image.name, dataUrl: image.dataUrl, width, height };
}
function validateLine(value: unknown, image: ImageSource, lineIds: Set<string>): NoteLine {
  const line = record(value);
  if (typeof line.id !== 'string' || !line.id || lineIds.has(line.id)) invalid();
  lineIds.add(line.id);
  if (typeof line.text !== 'string' || typeof line.modelText !== 'string' || typeof line.edited !== 'boolean' || typeof line.revision !== 'number' || !Number.isInteger(line.revision) || line.revision < 0) invalid();
  if (typeof line.status !== 'string' || !['idle', 'scanning', 'success', 'error', 'stale'].includes(line.status) || (line.error !== undefined && typeof line.error !== 'string')) invalid();
  const box = record(line.box);
  const { x, y, width, height } = box;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number' || ![x, y, width, height].every(Number.isFinite)) invalid();
  if (x < 0 || y < 0 || width < 1 || height < 1 || x + width > image.width || y + height > image.height) invalid();
  return { id: line.id, box: { x, y, width, height }, text: line.text, modelText: line.modelText, edited: line.edited,
    revision: line.revision, status: line.status as NoteLine['status'], ...(line.error !== undefined ? { error: line.error } : {}) };
}

export function validateAndMigrateProject(value: unknown): ScannerProject {
  const project = record(value);
  if (typeof project.id !== 'string' || !project.id || ![1, 2].includes(Number(project.version))) invalid();
  if (project.version !== 1 && project.version !== 2) invalid();
  const sourcePages = project.version === 1 ? [{ id: `${project.id}-page`, image: project.image, lines: project.lines }] : project.pages;
  if (!Array.isArray(sourcePages) || sourcePages.length > MAX_PROJECT_PAGES) invalid();
  const pageIds = new Set<string>();
  const lineIds = new Set<string>();
  const pages: ScannerPage[] = sourcePages.map(value => {
    const page = record(value);
    if (typeof page.id !== 'string' || !page.id || pageIds.has(page.id) || !Array.isArray(page.lines) || page.lines.length > 200) invalid();
    pageIds.add(page.id);
    const image = validateImage(page.image);
    return { id: page.id, image, lines: page.lines.map(line => validateLine(line, image, lineIds)) };
  });
  const activePageId = project.version === 1 ? pages[0].id : project.activePageId;
  if (pages.length ? typeof activePageId !== 'string' || !pageIds.has(activePageId) : activePageId !== null) invalid();
  return { version: 2, id: project.id, pages, activePageId: activePageId as string | null,
    ...(project.playback !== undefined ? { playback: validatePlaybackSettings(project.playback) } : {}) };
}
