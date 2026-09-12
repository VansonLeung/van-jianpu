import { useEffect, useRef } from 'react';
import { Rect, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { BoundingBox, NoteLine } from '../types/scanner';
import { clampBoundingBox } from '../services/imageProcessing';

interface Props {
  line: NoteLine; order: number; selected: boolean; interactive: boolean; zoom: number;
  imageWidth: number; imageHeight: number;
  onSelect: () => void; onChange: (box: BoundingBox) => void;
}

export function AnnotationRectangle({ line, order, selected, interactive, zoom, imageWidth, imageHeight, onSelect, onChange }: Props) {
  const rectangle = useRef<Konva.Rect>(null);
  const transformer = useRef<Konva.Transformer>(null);
  useEffect(() => {
    if (selected && interactive && rectangle.current && transformer.current) transformer.current.nodes([rectangle.current]);
  }, [selected, interactive]);
  return <>
    <Rect ref={rectangle} {...line.box} stroke={selected ? '#315eea' : '#768ab9'} strokeWidth={2 / zoom}
      fill={selected ? 'rgba(49,94,234,0.10)' : 'rgba(49,94,234,0.035)'}
      draggable={interactive} listening={interactive}
      dragBoundFunc={position => ({
        x: Math.max(0, Math.min((imageWidth - line.box.width) * zoom, position.x)),
        y: Math.max(0, Math.min((imageHeight - line.box.height) * zoom, position.y)),
      })}
      onClick={onSelect} onTap={onSelect} onDragStart={onSelect}
      onDragEnd={event => onChange(clampBoundingBox({ ...line.box, x: event.target.x(), y: event.target.y() }, imageWidth, imageHeight))}
      onTransformEnd={() => {
        const node = rectangle.current!;
        const box = clampBoundingBox({ x: node.x(), y: node.y(), width: node.width() * node.scaleX(), height: node.height() * node.scaleY() }, imageWidth, imageHeight);
        node.scaleX(1); node.scaleY(1);
        onChange(box);
      }} />
    <Text x={line.box.x} y={Math.max(0, line.box.y - 20 / zoom)} text={String(order)}
      fontSize={12 / zoom} padding={3 / zoom} fill="#315eea" listening={false} />
    {selected && interactive && <Transformer ref={transformer} rotateEnabled={false} flipEnabled={false}
      keepRatio={false} anchorSize={8} borderStroke="#315eea" anchorStroke="#315eea"
      boundBoxFunc={(oldBox, newBox) => newBox.width < 6 || newBox.height < 6 ? oldBox : newBox} />}
  </>;
}
