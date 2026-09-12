import { Button, Empty, Space, Tag } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, HolderOutlined } from '@ant-design/icons';
import type { NoteLine } from '../types/scanner';
import { statusColors, statusLabels } from './lineStatus';

export const LINE_DRAG_TYPE = 'application/x-jianpu-line';
export function PageLineList({ pageId, pageNumber, lines, selectedId, busy, onSelect, onMove, onDelete, onDropLine }: {
  pageId: string; pageNumber: number; lines: NoteLine[]; selectedId: string | null; busy: boolean;
  onSelect: (id: string) => void; onMove: (id: string, offset: number) => void; onDelete: (id: string) => void;
  onDropLine: (id: string, beforeId: string) => void;
}) {
  return <div className="page-lines" role="group" aria-label={`Lines for page ${pageNumber}`}>
    {!lines.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Draw a rectangle to add a line" />}
    {lines.map((line, index) => <div key={line.id} data-line-id={line.id} className={`line-item ${selectedId === line.id ? 'selected' : ''}`}
      onDragOver={event => { if (!busy && event.dataTransfer.types.includes(LINE_DRAG_TYPE)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; } }}
      onDrop={event => {
        if (!event.dataTransfer.types.includes(LINE_DRAG_TYPE)) return;
        event.preventDefault(); event.stopPropagation();
        if (busy) return;
        try { const source = JSON.parse(event.dataTransfer.getData(LINE_DRAG_TYPE)); if (source.pageId === pageId && typeof source.id === 'string') onDropLine(source.id, line.id); } catch { /* Ignore unrelated drops. */ }
      }}>
      <button className="line-select" onClick={() => onSelect(line.id)} aria-label={`Select line ${index + 1}`}>
        <span className="line-number">{String(index + 1).padStart(2, '0')}</span>
        <span><strong>Line {index + 1}</strong><Tag color={statusColors[line.status]}>{statusLabels[line.status]}</Tag></span>
      </button>
      <Space size={0} className="line-actions">
        <span className={`reorder-grip ${busy ? 'disabled' : ''}`} draggable={!busy} title="Drag before another line on this page" aria-label={`Drag line ${index + 1}`}
          onDragStart={event => { event.stopPropagation(); event.dataTransfer.setData(LINE_DRAG_TYPE, JSON.stringify({ pageId, id: line.id })); event.dataTransfer.effectAllowed = 'move'; }}><HolderOutlined /></span>
        <Button size="small" type="text" aria-label={`Move line ${index + 1} up`} disabled={busy || index === 0} icon={<ArrowUpOutlined />} onClick={() => onMove(line.id, -1)} />
        <Button size="small" type="text" aria-label={`Move line ${index + 1} down`} disabled={busy || index === lines.length - 1} icon={<ArrowDownOutlined />} onClick={() => onMove(line.id, 1)} />
        <Button size="small" type="text" aria-label={`Delete line ${index + 1}`} disabled={busy} icon={<DeleteOutlined />} onClick={() => onDelete(line.id)} />
      </Space>
    </div>)}
  </div>;
}
