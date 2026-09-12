import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { ScannerProject } from '../types/scanner';
import { MAX_PROJECT_BYTES, MAX_PROJECT_PAGES, validateAndMigrateProject } from './projectValidation';

const imagePath = /^images\/(0|[1-9]\d*)\.(png|jpeg|webp)$/;
function invalid(): never { throw new Error('This is not a valid Van Jianpu project archive.'); }
function checkSize(size: number) {
  if (size > MAX_PROJECT_BYTES) throw new Error('The project exceeds the 100 MB limit (including expanded image data).');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

// Called inside a dedicated worker: conversion, JSON parsing and compression never block editing.
export function encodeProjectArchive(source: ScannerProject): Uint8Array {
  const project = validateAndMigrateProject(source);
  const files: Zippable = {};
  const seen = new Map<string, string>();
  let expandedSize = 0;
  const pages = project.pages.map(page => {
    const { dataUrl, ...image } = page.image;
    expandedSize += dataUrl.length;
    checkSize(expandedSize);
    let path = seen.get(dataUrl);
    if (!path) {
      const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
      if (!match) invalid();
      path = `images/${seen.size}.${match[1]}`;
      const binary = atob(match[2]);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      files[path] = bytes;
      seen.set(dataUrl, path);
    }
    return { ...page, image: { ...image, path } };
  });
  const manifest = strToU8(JSON.stringify({ ...project, version: 3, pages }, null, 2));
  checkSize(expandedSize + manifest.length);
  files['project.json'] = manifest;
  const archive = zipSync(files, { level: 6 });
  checkSize(archive.length);
  return archive;
}

export function decodeProjectFile(bytes: Uint8Array): ScannerProject {
  checkSize(bytes.length);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return validateAndMigrateProject(JSON.parse(strFromU8(bytes)));
  // Inspect the entire directory before allocating expanded entries. No archive path is written to disk.
  const names = new Set<string>();
  let expandedSize = 0;
  unzipSync(bytes, { filter: entry => {
    if (names.has(entry.name) || (entry.name !== 'project.json' && !imagePath.test(entry.name))) invalid();
    names.add(entry.name);
    if (names.size > MAX_PROJECT_PAGES + 1) invalid();
    expandedSize += entry.originalSize;
    checkSize(expandedSize);
    return false;
  } });
  if (!names.has('project.json')) invalid();
  const files = unzipSync(bytes);
  const manifest = record(JSON.parse(strFromU8(files['project.json'])));
  if (manifest.version !== 3 || !Array.isArray(manifest.pages) || manifest.pages.length > MAX_PROJECT_PAGES) invalid();
  let restoredSize = files['project.json'].length;
  const urls = new Map<string, string>();
  const pages = manifest.pages.map(value => {
    const page = record(value);
    const { path, ...image } = record(page.image);
    if (typeof path !== 'string' || !imagePath.test(path) || !Object.hasOwn(files, path) || image.dataUrl !== undefined) invalid();
    restoredSize += 4 * Math.ceil(files[path].length / 3) + 32;
    checkSize(restoredSize);
    let dataUrl = urls.get(path);
    if (!dataUrl) {
      const bytes = files[path];
      const chunks: string[] = [];
      for (let start = 0; start < bytes.length; start += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(start, start + 0x8000)));
      dataUrl = `data:image/${imagePath.exec(path)![2]};base64,${btoa(chunks.join(''))}`;
      urls.set(path, dataUrl);
    }
    return { ...page, image: { ...image, dataUrl } };
  });
  return validateAndMigrateProject({ ...manifest, version: 2, pages });
}
