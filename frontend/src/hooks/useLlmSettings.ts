import { useEffect, useState } from 'react';
import type { LlmSettings, ServerSettings } from '../types/scanner';
import { fetchServerSettings } from '../services/scannerApi';

export function useLlmSettings() {
  const [settings, setSettings] = useState<LlmSettings>({ baseUrl: '', model: '', apiKey: '' });
  const [defaults, setDefaults] = useState<ServerSettings | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetchServerSettings().then(server => {
      if (!active) return;
      setDefaults(server);
      let saved: Partial<LlmSettings> = {};
      try { saved = JSON.parse(localStorage.getItem('jianpu-llm-settings') || '{}') || {}; } catch { /* Use server defaults. */ }
      setSettings({ baseUrl: typeof saved.baseUrl === 'string' ? saved.baseUrl : server.baseUrl, model: typeof saved.model === 'string' ? saved.model : server.model, apiKey: '' });
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Unable to load backend settings.'); });
    return () => { active = false; };
  }, []);
  function updateSettings(next: LlmSettings) {
    setSettings(next);
    setError('');
    try { localStorage.setItem('jianpu-llm-settings', JSON.stringify({ baseUrl: next.baseUrl, model: next.model })); }
    catch { setError('Settings apply for this session; browser storage is unavailable.'); }
  }
  return { settings, defaults, error, updateSettings };
}
