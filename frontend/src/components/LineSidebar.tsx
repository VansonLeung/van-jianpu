import { Button, Space, Tag } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, HolderOutlined, ScanOutlined } from '@ant-design/icons';
import type { ScannerPage } from '../types/scanner';
import { PageLineList } from './PageLineList';

const PAGE_DRAG_TYPE = 'application/x-jianpu-page';
interface Props {
  pages: ScannerPage[]; activePageId: string | null; selectedId: string | null; busy: boolean;
  onSelectPage: (id: string) => void; onMovePage: (id: string, offset: number) => void;
  onDeletePage: (id: string) => void; onDropPage: (id: string, beforeId: string) => void;
  onSelect: (id: string) => void; onMove: (id: string, offset: number) => void; onDelete: (id: string) => void;
  onDropLine: (id: string, beforeId: string) => void; onScan: () => void; onCancel: () => void;
}
export function LineSidebar({ pages, activePageId, selectedId, busy, onSelectPage, onMovePage, onDeletePage, onDropPage, onSelect, onMove, onDelete, onDropLine, onScan, onCancel }: Props) {
  const pending = pages.find(page => page.id === activePageId)?.lines.filter(line => line.status !== 'success').length || 0;
  return <aside className="line-sidebar">
    <div className="panel-heading"><span>Pages & lines</span><span className="count-badge">{pages.length}</span></div>
    <div className="page-list">
      {pages.map((page, index) => <section key={page.id} className={`page-node ${page.id === activePageId ? 'active-page' : ''}`} data-page-id={page.id}
        onDragOver={event => { if (!busy && event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
        onDrop={event => { if (!busy && event.dataTransfer.types.includes(PAGE_DRAG_TYPE)) { event.preventDefault(); onDropPage(event.dataTransfer.getData(PAGE_DRAG_TYPE), page.id); } }}>
        <button className="page-select" aria-label={`Select page ${index + 1}`} aria-expanded={page.id === activePageId} onClick={() => onSelectPage(page.id)}>
          <img src={page.image.dataUrl} alt="" /><span><strong>Page {index + 1}</strong><span className="page-filename" title={page.image.name}>{page.image.name}</span><small>{page.lines.length} {page.lines.length === 1 ? 'line' : 'lines'}</small></span>
        </button>
        <Space size={0} className="page-actions">
          {page.lines.some(line => line.status === 'scanning') && <Tag color="processing">Scanning</Tag>}
          <span className={`reorder-grip ${busy ? 'disabled' : ''}`} draggable={!busy} title="Drag before another page" aria-label={`Drag page ${index + 1}`}
            onDragStart={event => { event.dataTransfer.setData(PAGE_DRAG_TYPE, page.id); event.dataTransfer.effectAllowed = 'move'; }}><HolderOutlined /></span>
          <Button size="small" type="text" aria-label={`Move page ${index + 1} up`} disabled={busy || index === 0} icon={<ArrowUpOutlined />} onClick={() => onMovePage(page.id, -1)} />
          <Button size="small" type="text" aria-label={`Move page ${index + 1} down`} disabled={busy || index === pages.length - 1} icon={<ArrowDownOutlined />} onClick={() => onMovePage(page.id, 1)} />
          <Button size="small" type="text" aria-label={`Delete page ${index + 1}`} disabled={busy} icon={<DeleteOutlined />} onClick={() => onDeletePage(page.id)} />
        </Space>
        {page.id === activePageId && <PageLineList pageId={page.id} pageNumber={index + 1} lines={page.lines} selectedId={selectedId} busy={busy}
          onSelect={onSelect} onMove={onMove} onDelete={onDelete} onDropLine={onDropLine} />}
      </section>)}
    </div>
    <div className="sidebar-footer">
      <Button aria-label={`Scan ${pending} pending ${pending === 1 ? 'line' : 'lines'}`} type="primary" block icon={<ScanOutlined />} disabled={busy || !pending} onClick={onScan}>Scan {pending || ''} pending {pending === 1 ? 'line' : 'lines'}</Button>
      {busy && <Button block onClick={onCancel}>Cancel scanning</Button>}
      <span>Scan applies to the selected page.</span>
    </div>
  </aside>;
}
