import { parseNoteNotation } from '../noteNotation';
import type { ScannerProject } from '../../types/scanner';
import { layoutJianpuTokens, type JianpuLayout, type JianpuPrimitive } from './jianpuLayout';

export const JIANPU_FONT = 'Arial, Helvetica, sans-serif';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
function primitiveSvg(p: JianpuPrimitive): string {
  if (p.kind === 'text') return `<text x="${p.x}" y="${p.y}" font-size="${p.size}"${p.mark === 'digit' ? ' textLength="16" lengthAdjust="spacingAndGlyphs"' : ''}>${escape(p.text)}</text>`;
  if (p.kind === 'circle') return `<circle cx="${p.x}" cy="${p.y}" r="${p.radius}"/>`;
  return `<line x1="${p.x}" y1="${p.y}" x2="${p.x2}" y2="${p.y2}" stroke="currentColor" stroke-width="${p.stroke}"/>`;
}
export function layoutSvgContents(layout: JianpuLayout): string {
  return layout.glyphs.map(g => `<g transform="translate(${g.x} ${g.y})">${g.primitives.map(primitiveSvg).join('')}</g>`).join('');
}
function svgDocument(width: number, height: number, title: string, contents: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" font-family="${JIANPU_FONT}" fill="#172033" color="#172033"><title>${escape(title)}</title><rect width="100%" height="100%" fill="white"/>${contents}</svg>`;
}
export function lineSvg(layout: JianpuLayout, title: string): string {
  return svgDocument(layout.width, layout.height, title, layoutSvgContents(layout));
}
export function projectSvg(project: ScannerProject): string {
  const width = 1000; const margin = 32;
  let y = margin; const contents: string[] = [];
  project.pages.forEach((page, pageIndex) => {
    contents.push(`<g aria-label="Page ${pageIndex + 1}"><text x="${margin}" y="${y + 20}" font-size="20" font-weight="bold">${escape(`Page ${pageIndex + 1} · ${page.image.name}`)}</text>`);
    y += 52;
    if (!page.lines.length) { contents.push(`<text x="${margin}" y="${y}" font-size="14" fill="#667085">No transcribed lines</text>`); y += 30; }
    page.lines.forEach((line, index) => {
      const parsed = parseNoteNotation(line.text.trim() || '?');
      if (parsed.error) throw new Error(`Cannot export ${page.image.name}, line ${index + 1}: ${parsed.error}`);
      const layout = layoutJianpuTokens(parsed.tokens, width - margin * 2);
      contents.push(`<text x="${margin}" y="${y}" font-size="13" fill="#667085">Line ${index + 1}${line.text.trim() ? '' : ' · empty transcription'}</text><g transform="translate(${margin} ${y + 10})">${layoutSvgContents(layout)}</g>`);
      y += layout.height + 40;
    });
    contents.push('</g>'); y += 32;
  });
  return svgDocument(width, y, 'Jianpu transcription', contents.join(''));
}
