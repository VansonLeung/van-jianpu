import { useEffect, useRef, useState } from 'react';
import { Alert, App as AntApp, Button, Dropdown, Empty, Space, Spin, Upload } from 'antd';
import { DownloadOutlined, FolderOpenOutlined, PictureOutlined, SettingOutlined, UploadOutlined } from '@ant-design/icons';
import { AnnotationWorkspace } from './components/AnnotationWorkspace';
import { LineSidebar } from './components/LineSidebar';
import { ResultsEditor } from './components/ResultsEditor';
import { LlmSettingsDrawer } from './components/LlmSettingsDrawer';
import { ResizableEditorLayout } from './components/ResizableEditorLayout';
import { PlaybackProvider } from './components/playback/PlaybackProvider';
import { PlaybackToolbar } from './components/playback/PlaybackToolbar';
import { projectSvg } from './services/rendering/jianpuSvg';
import { useScannerProject } from './hooks/useScannerProject';
import { useLineScanning } from './hooks/useLineScanning';
import { useLlmSettings } from './hooks/useLlmSettings';
import { NoteHistoryProvider } from './hooks/useNoteEditingHistory';
import { clampBoundingBox, loadImage } from './services/imageProcessing';
import { downloadFile, importProject } from './services/projectStorage';
import { appendImagePages, moveItemBefore, projectTranscriptionText, reorderItems, updateProjectPage } from './services/projectPages';
import type { BoundingBox, NoteLine, ScannerPage } from './types/scanner';

export default function App() {
  const { message, modal } = AntApp.useApp();
  const { project, current, updateProject, ready, saveStatus } = useScannerProject();
  const { settings, defaults, error: settingsError, updateSettings } = useLlmSettings();
  const { busy, cancel, scanLines } = useLineScanning(current, updateProject);
  const page = project?.pages.find(page => page.id === project.activePageId) || null;
  const [loadedImage, setLoadedImage] = useState<{ pageId: string; image: HTMLImageElement } | null>(null);
  const image = loadedImage?.pageId === page?.id ? loadedImage?.image : null;
  const [imageError, setImageError] = useState('');
  const [selectedByPage, setSelectedByPage] = useState<Record<string, string | null>>({});
  const selectedId = page ? selectedByPage[page.id] !== undefined ? selectedByPage[page.id] : page.lines[0]?.id || null : null;
  const setSelectedId = (id: string | null) => { if (page) setSelectedByPage(previous => ({ ...previous, [page.id]: id })); };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const importLock = useRef(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    setLoadedImage(null); setImageError('');
    if (page) loadImage(page.image.dataUrl).then(image => { if (active) setLoadedImage({ pageId: page.id, image }); })
      .catch(error => { if (active) setImageError(error.message); });
    return () => { active = false; };
  }, [project?.id, page?.id, page?.image.dataUrl]);

  async function openFiles(files: File[], asProject = false) {
    if (!files.length || importLock.current) return;
    importLock.current = true; setImporting(true);
    try {
      if (asProject) {
        const next = await importProject(files[0]);
        next.id = crypto.randomUUID();
        const apply = () => { updateProject(next); setSelectedByPage({}); };
        if (current.current) modal.confirm({ title: 'Replace the current project?', content: 'Export your current project first if you want to keep a separate copy.', okText: 'Replace', onOk: apply });
        else apply();
      } else updateProject(await appendImagePages(current.current, files));
    } catch (error) { message.error(error instanceof Error ? error.message : 'Unable to open the files.'); }
    finally { importLock.current = false; setImporting(false); }
  }
  const updatePage = (change: (page: ScannerPage) => ScannerPage) => { if (page) updateProject(previous => updateProjectPage(previous, page.id, change)); };
  const editLine = (id: string, patch: Partial<NoteLine>) => updatePage(page => ({ ...page, lines: page.lines.map(line => line.id === id ? { ...line, ...patch } : line) }));
  function createLine(box: BoundingBox) {
    if (!page) return;
    if (page.lines.length >= 200) { message.warning('A page can contain at most 200 lines.'); return; }
    const line: NoteLine = { id: crypto.randomUUID(), box: clampBoundingBox(box, page.image.width, page.image.height), revision: 0, text: '', modelText: '', edited: false, status: 'idle' };
    updatePage(page => ({ ...page, lines: [...page.lines, line] })); setSelectedId(line.id);
  }
  function changeBox(id: string, box: BoundingBox) {
    updatePage(page => ({ ...page, lines: page.lines.map(line => line.id === id
      ? { ...line, box, revision: line.revision + 1, status: line.text || line.modelText ? 'stale' : 'idle', error: undefined } : line) }));
  }
  function deleteLine(id: string) {
    const apply = () => { updatePage(page => ({ ...page, lines: page.lines.filter(line => line.id !== id) })); if (selectedId === id) setSelectedId(null); };
    if (page?.lines.find(line => line.id === id)?.text) modal.confirm({ title: 'Delete this line and its text?', okText: 'Delete', okButtonProps: { danger: true }, onOk: apply });
    else apply();
  }
  function deletePage(id: string) {
    const target = project?.pages.find(page => page.id === id);
    if (!target) return;
    modal.confirm({ title: 'Delete this page and its lines?', content: `${target.image.name} · ${target.lines.length} lines. Other pages will remain in the project.`, okText: 'Delete page', okButtonProps: { danger: true },
      onOk: () => updateProject(previous => {
        if (!previous) return previous;
        const index = previous.pages.findIndex(page => page.id === id);
        const pages = previous.pages.filter(page => page.id !== id);
        return { ...previous, pages, activePageId: previous.activePageId === id ? pages[Math.min(index, pages.length - 1)]?.id || null : previous.activePageId };
      }) });
  }
  function scan(lines: NoteLine[]) {
    if (!page) return;
    if (!settings.baseUrl || !settings.model) { setSettingsOpen(true); message.info('Set the LLM endpoint and model before scanning.'); return; }
    void scanLines(page.id, lines, settings);
  }
  function exportFile(format: string) {
    if (!project) return;
    const name = project.pages[0]?.image.name.replace(/\.[^.]+$/, '') || 'jianpu';
    if (format === 'project') downloadFile(`${name}.jianpu.json`, JSON.stringify(project), 'application/json');
    else if (format === 'svg') {
      try { downloadFile(`${name}.svg`, projectSvg(project), 'image/svg+xml;charset=utf-8'); }
      catch (error) { message.error(error instanceof Error ? error.message : 'Unable to render notation.'); }
    }
    else {
      const unresolved = project.pages.some(page => page.lines.some(line => line.status !== 'success' || !line.text.trim()));
      const apply = () => downloadFile(`${name}.txt`, projectTranscriptionText(project), 'text/plain;charset=utf-8');
      if (unresolved) modal.confirm({ title: 'Export with unfinished lines?', content: 'Unscanned, changed, or failed lines may contain old text. Empty lines will be exported as ?.', okText: 'Export', onOk: apply });
      else apply();
    }
  }
  const selectLine = (id: string) => { setSelectedId(id); document.getElementById(`result-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  return <PlaybackProvider project={project} onSettings={playback => updateProject(previous => previous && ({ ...previous, playback }))}
    onFollowPage={id => updateProject(previous => previous && ({ ...previous, activePageId: id }))}><div className="scanner-app">
    <header className="app-toolbar">
      <div className="document-title"><PictureOutlined /><span title={page?.image.name}>{page ? `Page ${project!.pages.indexOf(page) + 1} · ${page.image.name}` : 'Van Jianpu'}</span></div>
      <Space size={8} wrap>
        <Button aria-label="Add images" icon={<UploadOutlined />} disabled={!ready || busy || importing} onClick={() => imageInput.current?.click()}>Add images</Button>
        <Button aria-label="Open project" icon={<FolderOpenOutlined />} disabled={!ready || busy || importing} onClick={() => projectInput.current?.click()}>Open project</Button>
        <Dropdown trigger={['click']} menu={{ items: [{ key: 'text', label: 'Jianpu text (.txt)', disabled: !project?.pages.some(page => page.lines.length) }, { key: 'svg', label: 'Rendered notation (.svg)', disabled: !project?.pages.length }, { key: 'project', label: 'Editable project (.jianpu.json)' }], onClick: ({ key }) => exportFile(key) }} disabled={!project}>
          <Button aria-label="Export" icon={<DownloadOutlined />}>Export</Button>
        </Dropdown>
        <Button aria-label="LLM settings" icon={<SettingOutlined />} disabled={busy} onClick={() => setSettingsOpen(true)} />
      </Space>
      <input ref={imageInput} data-testid="image-input" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void openFiles(files); }} />
      <input ref={projectInput} data-testid="project-input" type="file" accept=".json,.jianpu.json" hidden onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void openFiles(files, true); }} />
    </header>
    {settingsError && <Alert type="warning" title={settingsError} closable />}
    {!!project?.pages.length && <PlaybackToolbar pageId={page?.id} available={!importing && !!project.pages.some(page => page.lines.length)} />}
    <NoteHistoryProvider key={project?.id || 'empty'}>
      {!ready || importing ? <div className="loading-state"><Spin size="large" /></div> : !project?.pages.length ? <div className="empty-workspace">
        <Upload.Dragger accept="image/png,image/jpeg,image/webp" showUploadList={false} multiple beforeUpload={(file, files) => { if (file.uid === files[0].uid) void openFiles(files); return false; }}>
          <Empty image={<PictureOutlined />} description={<><strong>Import Jianpu pages</strong><span>Drop images here or click to browse</span><small>PNG, JPEG, WebP · up to 20 MB per image</small></>} />
        </Upload.Dragger>
      </div> : <ResizableEditorLayout
        sidebar={<LineSidebar pages={project.pages} activePageId={project.activePageId} selectedId={selectedId} busy={busy}
          onSelectPage={id => updateProject(previous => previous && ({ ...previous, activePageId: id }))}
          onMovePage={(id, offset) => updateProject(previous => previous && ({ ...previous, pages: reorderItems(previous.pages, id, offset) }))}
          onDropPage={(id, beforeId) => updateProject(previous => previous && ({ ...previous, pages: moveItemBefore(previous.pages, id, beforeId) }))} onDeletePage={deletePage}
          onSelect={selectLine} onMove={(id, offset) => updatePage(page => ({ ...page, lines: reorderItems(page.lines, id, offset) }))} onDelete={deleteLine}
          onDropLine={(id, beforeId) => updatePage(page => ({ ...page, lines: moveItemBefore(page.lines, id, beforeId) }))}
          onScan={() => scan(page?.lines.filter(line => line.status !== 'success') || [])} onCancel={cancel} />}
        workspace={page && image ? <AnnotationWorkspace key={page.id} image={image} lines={page.lines} selectedId={selectedId} disabled={busy}
          onSelect={setSelectedId} onCreate={createLine} onChange={changeBox} /> : <div className="loading-state">{imageError ? <Alert type="error" title={imageError} /> : <Spin />}</div>}
        results={page && image ? <ResultsEditor key={page.id} pageId={page.id} image={image} lines={page.lines} selectedId={selectedId} busy={busy} onSelect={setSelectedId}
          onEdit={(id, text) => editLine(id, { text, edited: true })} onScan={line => scan([line])}
          onUseModel={id => { const line = page.lines.find(line => line.id === id); if (line) editLine(id, { text: line.modelText, edited: false }); }} /> : <aside className="results-panel" id="transcription-panel" />}
      />}
    </NoteHistoryProvider>
    <footer className="app-status"><span className={saveStatus.includes('failed') ? 'save-error' : ''}>{saveStatus || 'No project open'}</span>
      <span>{project ? `${project.pages.length} ${project.pages.length === 1 ? 'page' : 'pages'}` : ''}</span><span>{busy ? 'Scanning…' : page ? `${page.image.width} × ${page.image.height} px` : ''}</span><span title={settings.model}>{settings.model || 'No model configured'}</span></footer>
    <LlmSettingsDrawer open={settingsOpen} settings={settings} defaults={defaults} onClose={() => setSettingsOpen(false)} onSave={updateSettings} />
  </div></PlaybackProvider>;
}
