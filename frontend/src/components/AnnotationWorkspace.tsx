import { useEffect, useRef, useState } from 'react';
import { Button, Segmented, Space, Tooltip } from 'antd';
import { AimOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { Image as CanvasImage, Layer, Rect, Stage } from 'react-konva';
import type Konva from 'konva';
import type { BoundingBox, NoteLine } from '../types/scanner';
import { AnnotationRectangle } from './AnnotationRectangle';

interface Props {
  image: HTMLImageElement; lines: NoteLine[]; selectedId: string | null; disabled: boolean;
  onSelect: (id: string | null) => void; onCreate: (box: BoundingBox) => void;
  onChange: (id: string, box: BoundingBox) => void;
}
type CanvasEvent = Konva.KonvaEventObject<MouseEvent | TouchEvent>;

export function AnnotationWorkspace({ image, lines, selectedId, disabled, onSelect, onCreate, onChange }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState('Draw');
  const [draft, setDraft] = useState<BoundingBox | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const fit = () => setZoom(Math.max(0.05, Math.min(2, ((viewport.current?.clientWidth || 800) - 56) / image.naturalWidth)));
  useEffect(() => { fit(); }, [image]);
  const point = () => {
    const position = stage.current?.getPointerPosition();
    if (!position) return null;
    return { x: Math.max(0, Math.min(image.naturalWidth, position.x / zoom)), y: Math.max(0, Math.min(image.naturalHeight, position.y / zoom)) };
  };
  const begin = (event: CanvasEvent) => {
    if (disabled) return;
    if ('button' in event.evt && event.evt.button !== 0) return;
    if (mode === 'Draw') {
      start.current = point();
      if (start.current) setDraft({ ...start.current, width: 0, height: 0 });
    } else if (event.target === stage.current) onSelect(null);
  };
  const move = () => {
    const end = point();
    if (!start.current || !end) return;
    setDraft({ x: Math.min(start.current.x, end.x), y: Math.min(start.current.y, end.y), width: Math.abs(start.current.x - end.x), height: Math.abs(start.current.y - end.y) });
  };
  const finish = () => {
    if (draft && draft.width >= 6 && draft.height >= 6) { onCreate(draft); setMode('Select'); }
    start.current = null;
    setDraft(null);
  };
  return <section className="annotation-workspace">
    <div className="workspace-toolbar">
      <Segmented aria-label="Canvas tool" options={['Draw', 'Select', 'Pan']} value={mode} disabled={disabled}
        onChange={value => { setMode(value); start.current = null; setDraft(null); }} />
      <Space size={2}>
        <Tooltip title="Zoom out"><Button aria-label="Zoom out" type="text" icon={<MinusOutlined />} onClick={() => setZoom(value => Math.max(0.05, value / 1.25))} /></Tooltip>
        <span className="zoom-value">{Math.round(zoom * 100)}%</span>
        <Tooltip title="Zoom in"><Button aria-label="Zoom in" type="text" icon={<PlusOutlined />} onClick={() => setZoom(value => Math.min(5, value * 1.25))} /></Tooltip>
        <Tooltip title="Fit width"><Button aria-label="Fit width" type="text" icon={<AimOutlined />} onClick={fit} /></Tooltip>
      </Space>
    </div>
    <div ref={viewport} className={`canvas-viewport tool-${mode.toLowerCase()}`} data-testid="canvas-viewport"
      onPointerDown={event => {
        if (mode !== 'Pan') return;
        event.currentTarget.setPointerCapture(event.pointerId);
        pan.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
      }}
      onPointerMove={event => {
        if (!pan.current) return;
        event.currentTarget.scrollLeft = pan.current.left - (event.clientX - pan.current.x);
        event.currentTarget.scrollTop = pan.current.top - (event.clientY - pan.current.y);
      }}
      onPointerUp={() => { pan.current = null; }} onPointerCancel={() => { pan.current = null; }}>
      <div className="canvas-paper" style={{ width: image.naturalWidth * zoom, height: image.naturalHeight * zoom }}>
        <Stage ref={stage} width={image.naturalWidth * zoom} height={image.naturalHeight * zoom} scaleX={zoom} scaleY={zoom}
          onMouseDown={begin} onTouchStart={begin} onMouseMove={move} onTouchMove={move}
          onMouseUp={finish} onTouchEnd={finish} onMouseLeave={finish}>
          <Layer>
            <CanvasImage image={image} listening={false} />
            {lines.map((line, index) => ({ line, index }))
              .sort((a, b) => Number(a.line.id === selectedId) - Number(b.line.id === selectedId))
              .map(({ line, index }) => <AnnotationRectangle key={line.id} line={line} order={index + 1}
              selected={line.id === selectedId} interactive={mode === 'Select' && !disabled} zoom={zoom}
              imageWidth={image.naturalWidth} imageHeight={image.naturalHeight}
              onSelect={() => onSelect(line.id)} onChange={box => onChange(line.id, box)} />)}
            {draft && <Rect {...draft} stroke="#315eea" strokeWidth={2 / zoom} fill="rgba(49,94,234,0.1)" dash={[5 / zoom, 3 / zoom]} listening={false} />}
          </Layer>
        </Stage>
      </div>
    </div>
    <div className="workspace-hint">{mode === 'Draw' ? 'Draw around one note line. Include octave dots and underlines.' : mode === 'Pan' ? 'Drag to move around the image.' : 'Select a rectangle to move or resize it.'}</div>
  </section>;
}
