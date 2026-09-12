import type { ScannerProject } from '../types/scanner';
import { loadImage } from './imageProcessing';
import { MAX_PROJECT_BYTES, validateAndMigrateProject } from './projectValidation';

let databasePromise: Promise<IDBDatabase> | undefined;
function openDatabase() {
  return databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('jianpu-scanner-v4', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readSavedProject(): Promise<ScannerProject | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction('projects').objectStore('projects').get('current');
    request.onsuccess = () => {
      try { resolve(request.result ? recoverProject(validateAndMigrateProject(request.result)) : null); }
      catch (error) { reject(error); }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(project: ScannerProject | null) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('projects', 'readwrite');
    transaction.objectStore('projects').put(project, 'current');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function recoverProject(project: ScannerProject): ScannerProject {
  return { ...project, pages: project.pages.map(page => ({ ...page, lines: page.lines.map(line => line.status === 'scanning'
    ? { ...line, status: 'error', error: 'The previous scan was interrupted. Retry this line.' }
    : line) })) };
}

export async function importProject(file: File): Promise<ScannerProject> {
  if (file.size > MAX_PROJECT_BYTES) throw new Error('The project exceeds the 100 MB limit.');
  const project = validateAndMigrateProject(JSON.parse(await file.text()));
  for (const { image } of project.pages) {
    const decoded = await loadImage(image.dataUrl);
    if (decoded.naturalWidth !== image.width || decoded.naturalHeight !== image.height) throw new Error('An image has inconsistent dimensions in this project.');
  }
  return recoverProject(project);
}

export function downloadFile(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
