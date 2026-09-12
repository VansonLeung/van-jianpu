import { useState } from 'react';
import { Button, Input, Modal } from 'antd';
import { EditOutlined, PictureOutlined } from '@ant-design/icons';
import type { ScannerProject } from '../types/scanner';
import { MAX_PROJECT_NAME_LENGTH, projectName } from '../services/projectName';

export function ProjectTitle({ project, onRename }: { project: ScannerProject | null; onRename: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const name = project ? projectName(project) : 'Van Jianpu';
  const page = project?.pages.find(page => page.id === project.activePageId);
  const save = () => { if (draft.trim()) { onRename(draft.trim()); setOpen(false); } };
  return <>
    <div className="document-title"><PictureOutlined />
      <div className="document-caption"><strong title={name}>{name}</strong>
        {page && <small title={page.image.name}>Page {project!.pages.indexOf(page) + 1} · {page.image.name}</small>}
      </div>
      {project && <Button aria-label="Rename project" title="Rename project" type="text" icon={<EditOutlined />} onClick={() => { setDraft(name); setOpen(true); }} />}
    </div>
    <Modal title="Rename project" open={open} onCancel={() => setOpen(false)} onOk={save} okText="Rename" okButtonProps={{ disabled: !draft.trim() }}
      afterOpenChange={visible => { if (visible) document.getElementById('project-name')?.focus(); }}>
      <label htmlFor="project-name">Project name</label>
      <Input id="project-name" value={draft} maxLength={MAX_PROJECT_NAME_LENGTH} showCount onChange={event => setDraft(event.target.value)} onPressEnter={save} />
    </Modal>
  </>;
}
