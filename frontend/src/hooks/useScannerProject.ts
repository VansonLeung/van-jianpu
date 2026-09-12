import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScannerProject } from '../types/scanner';
import { readSavedProject, saveProject } from '../services/projectStorage';

export function useScannerProject() {
  const [project, setProject] = useState<ScannerProject | null>(null);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Loading project…');
  const current = useRef(project);
  const canSave = useRef(false);
  const updateProject = useCallback((change: ScannerProject | null | ((previous: ScannerProject | null) => ScannerProject | null)) => {
    const next = typeof change === 'function' ? change(current.current) : change;
    current.current = next;
    canSave.current = true;
    setProject(next);
  }, []);
  useEffect(() => {
    let mounted = true;
    readSavedProject().then(saved => {
      if (mounted) { updateProject(saved); setSaveStatus(saved ? 'Saved locally' : ''); }
    }).catch(() => { if (mounted) setSaveStatus('Local recovery unavailable'); })
      .finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, [updateProject]);
  useEffect(() => {
    if (!ready || !canSave.current) return;
    let cancelled = false;
    setSaveStatus('Saving…');
    // Start an IndexedDB transaction for every edit so quick refreshes do not lose debounced changes.
    saveProject(project).then(() => { if (!cancelled) setSaveStatus('Saved locally'); })
      .catch(() => { if (!cancelled) setSaveStatus('Local save failed — export your project'); });
    return () => { cancelled = true; };
  }, [project, ready]);
  return { project, current, updateProject, ready, saveStatus };
}
