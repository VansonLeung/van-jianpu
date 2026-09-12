import type { ScannerProject } from '../types/scanner';

export const MAX_PROJECT_NAME_LENGTH = 120;
export function projectName(project: Pick<ScannerProject, 'name' | 'pages'>): string {
  return project.name || project.pages[0]?.image.name.replace(/\.[^.]+$/, '').trim().slice(0, MAX_PROJECT_NAME_LENGTH) || 'Untitled project';
}
export function projectFilename(project: ScannerProject): string {
  const name = projectName(project).replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '-').replace(/[. ]+$/, '');
  return !name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(name) ? `Project${name ? `-${name}` : ''}` : name;
}
