export interface ImageSource { name: string; dataUrl: string; width: number; height: number }
export interface BoundingBox { x: number; y: number; width: number; height: number }
export type LineStatus = 'idle' | 'scanning' | 'success' | 'error' | 'stale';
export interface NoteLine {
  id: string;
  box: BoundingBox;
  revision: number;
  text: string;
  modelText: string;
  edited: boolean;
  status: LineStatus;
  error?: string;
}
export interface ScannerPage {
  id: string;
  image: ImageSource;
  lines: NoteLine[];
}
export interface ScannerProject {
  name?: string;
  playback?: import('../services/playback/notationPlayback').PlaybackSettings;
  version: 2;
  id: string;
  pages: ScannerPage[];
  activePageId: string | null;
}
export interface LlmSettings { baseUrl: string; model: string; apiKey: string }
export interface ServerSettings { baseUrl: string; model: string; hasApiKey: boolean; provider: string }
