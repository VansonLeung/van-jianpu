import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

const STORAGE_KEY = 'jianpu-results-panel-width';
const MIN_WIDTH = 300;
const DEFAULT_WIDTH = 390;
export function ResizableEditorLayout({ sidebar, workspace, results }: { sidebar: ReactNode; workspace: ReactNode; results: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preferredWidth, setPreferredWidth] = useState(() => {
    try { const saved = Number(localStorage.getItem(STORAGE_KEY)); return Number.isFinite(saved) && saved >= MIN_WIDTH ? saved : DEFAULT_WIDTH; }
    catch { return DEFAULT_WIDTH; }
  });
  const [maximumWidth, setMaximumWidth] = useState(900);
  const width = Math.round(Math.max(MIN_WIDTH, Math.min(maximumWidth, preferredWidth)));
  const clamp = (value: number) => Math.round(Math.max(MIN_WIDTH, Math.min(maximumWidth, value)));
  useLayoutEffect(() => {
    const element = root.current!;
    const measure = () => setMaximumWidth(Math.max(MIN_WIDTH, Math.min(900, element.clientWidth - (element.firstElementChild?.getBoundingClientRect().width || 198) - 248)));
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, String(preferredWidth)); } catch { /* Keep the preference for this session. */ } }, [preferredWidth]);
  const finish = () => { drag.current = null; setDragging(false); };
  return <main ref={root} className={`editor-layout ${dragging ? 'resizing-panel' : ''}`} style={{ '--results-width': `${width}px` } as CSSProperties}>
    {sidebar}{workspace}
    <div className="panel-resize-handle" role="separator" aria-label="Resize transcription panel" aria-orientation="vertical" aria-controls="transcription-panel"
      aria-valuemin={MIN_WIDTH} aria-valuemax={Math.round(maximumWidth)} aria-valuenow={width} aria-valuetext={`${width} pixels wide`} tabIndex={0}
      title="Drag to resize. Arrow keys adjust width; double-click resets."
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, width }; setDragging(true); }}
      onPointerMove={event => { if (drag.current) setPreferredWidth(clamp(drag.current.width + drag.current.x - event.clientX)); }}
      onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
      onDoubleClick={() => setPreferredWidth(DEFAULT_WIDTH)}
      onKeyDown={event => {
        const delta = event.shiftKey ? 50 : 20;
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); setPreferredWidth(event.key === 'Home' ? MIN_WIDTH : event.key === 'End' ? maximumWidth : clamp(width + (event.key === 'ArrowLeft' ? delta : -delta)));
        }
      }}><span /></div>
    {results}
  </main>;
}
