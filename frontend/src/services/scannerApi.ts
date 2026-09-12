import type { LlmSettings, ServerSettings } from '../types/scanner';

async function readResponse<T>(response: Response): Promise<T> {
  let result;
  try { result = await response.json(); } catch { throw new Error('The backend returned an invalid response. Check that it is running.'); }
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result as T;
}

export async function fetchServerSettings(): Promise<ServerSettings> {
  return readResponse(await fetch('/api/settings'));
}

export async function scanImageCrop(image: string, settings: LlmSettings, signal: AbortSignal): Promise<string> {
  const result = await readResponse<{ text: string }>(await fetch('/api/transcribe', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, settings: {
      ...(settings.baseUrl.trim() ? { baseUrl: settings.baseUrl.trim() } : {}),
      ...(settings.model.trim() ? { model: settings.model.trim() } : {}),
      ...(settings.apiKey.trim() ? { apiKey: settings.apiKey.trim() } : {}),
    } }),
  }));
  return result.text;
}
