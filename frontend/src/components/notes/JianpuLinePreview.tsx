import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { Button } from 'antd';
import type { NotationToken } from '../../services/noteNotation';
import { layoutJianpuTokens, type JianpuPrimitive } from '../../services/rendering/jianpuLayout';
import { JIANPU_FONT, lineSvg } from '../../services/rendering/jianpuSvg';
import { downloadFile } from '../../services/projectStorage';

function Primitive({ primitive: p }: { primitive: JianpuPrimitive }) {
  if (p.kind === 'text') return <text data-mark={p.mark} x={p.x} y={p.y} fontSize={p.size} textLength={p.mark === 'digit' ? 16 : undefined} lengthAdjust="spacingAndGlyphs">{p.text}</text>;
  if (p.kind === 'circle') return <circle data-mark={p.mark} cx={p.x} cy={p.y} r={p.radius} />;
  return <line data-mark={p.mark} x1={p.x} y1={p.y} x2={p.x2} y2={p.y2} stroke="currentColor" strokeWidth={p.stroke} />;
}
export function JianpuLinePreview({ tokens, lineId, lineNumber, selection, playingIndex, viewRef, onFocus, onPointerDown, onPointerEnter, onSelect, onContextMenu }: {
  tokens: NotationToken[]; lineId: string; lineNumber: number; selection: number[]; playingIndex: number | null;
  viewRef: RefObject<HTMLDivElement | null>; onFocus: () => void;
  onPointerDown: (index: number, event: PointerEvent<SVGGElement>) => void; onPointerEnter: (index: number, event: PointerEvent<SVGGElement>) => void;
  onSelect: (index: number) => void; onContextMenu: (index: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => setWidth(Math.max(100, root.current!.clientWidth - 2)));
    observer.observe(root.current!); return () => observer.disconnect();
  }, []);
  const layout = useMemo(() => layoutJianpuTokens(tokens, width / zoom), [tokens, width, zoom]);
  return <div className="jianpu-preview" ref={root}>
    <div className="jianpu-preview-toolbar">
      <span>Jianpu</span>
      <Button size="small" aria-label={`Reduce notation size for line ${lineNumber}`} disabled={zoom <= 0.75} onClick={() => setZoom(z => Math.max(0.75, z - 0.25))}>−</Button>
      <button className="notation-zoom-reset" title="Reset notation size" aria-label={`Reset notation size for line ${lineNumber}`} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
      <Button size="small" aria-label={`Increase notation size for line ${lineNumber}`} disabled={zoom >= 2} onClick={() => setZoom(z => Math.min(2, z + 0.25))}>+</Button>
      <Button size="small" aria-label={`Download SVG for line ${lineNumber}`} disabled={!tokens.length} onClick={() => downloadFile(`line-${lineNumber}.svg`, lineSvg(layout, `Jianpu line ${lineNumber}`), 'image/svg+xml;charset=utf-8')}>SVG</Button>
    </div>
    <div className="jianpu-preview-viewport" ref={viewRef} role="listbox" aria-label={`Rendered notes for line ${lineNumber}`} aria-multiselectable="true" tabIndex={0} onFocus={onFocus}
      aria-activedescendant={selection.length ? `rendered-note-${lineId}-${selection[selection.length - 1]}` : undefined}>
      {!tokens.length ? <span className="note-empty">Enter notes to see the notation.</span> : <svg role="presentation" width="100%" height={layout.height * zoom} viewBox={`0 0 ${layout.width} ${layout.height}`} fontFamily={JIANPU_FONT} fill="currentColor">
        {layout.glyphs.map(g => <g key={g.index} id={`rendered-note-${lineId}-${g.index}`} data-token-index={g.index} transform={`translate(${g.x} ${g.y})`}
          role="option" aria-label={`${g.token.kind === 'note' || g.token.kind === 'unknown' ? 'Note' : 'Symbol'} ${g.index + 1}: ${g.token.text}`} aria-selected={selection.includes(g.index)} aria-current={playingIndex === g.index ? 'true' : undefined}
          className={`jianpu-glyph ${g.token.kind === 'unknown' ? 'is-unknown' : ''} ${selection.includes(g.index) ? 'is-selected' : ''} ${playingIndex === g.index ? 'is-playing' : ''}`}
          onPointerDown={event => onPointerDown(g.index, event)} onPointerEnter={event => onPointerEnter(g.index, event)}
          onClick={event => { if (event.detail === 0) onSelect(g.index); }} onContextMenu={() => onContextMenu(g.index)}>
          <rect className="jianpu-hit-area" x={1} y={1} width={g.width - 2} height={g.height - 2} rx={4} />
          <g pointerEvents="none">{g.primitives.map((p, i) => <Primitive key={i} primitive={p} />)}</g>
        </g>)}
      </svg>}
    </div>
  </div>;
}
