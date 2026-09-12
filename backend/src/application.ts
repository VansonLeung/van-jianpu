import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { configuration } from './configuration.js';
import { scanRequestSchema, transcribeLine } from './transcribeLine.js';

export function createApplication() {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '17mb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/settings', (_req, res) => res.json({
    provider: configuration.provider,
    baseUrl: configuration.baseUrl,
    model: configuration.model,
    hasApiKey: Boolean(configuration.apiKey),
  }));
  let activeRequests = 0;
  app.post('/api/transcribe', async (req, res) => {
    const parsed = scanRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide a valid image crop and LLM settings.' });
      return;
    }
    if (activeRequests >= 3) {
      res.status(429).json({ error: 'Three lines are already scanning. Retry when one finishes.' });
      return;
    }
    activeRequests++;
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      res.json({ text: await transcribeLine(parsed.data, controller.signal) });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'Unable to scan this line.';
      res.status(502).json({ error: /timeout|abort/i.test(message) ? 'The LLM request timed out. Retry this line.' : message });
    } finally {
      activeRequests--;
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API endpoint.' }));
  const frontendDirectory = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
  app.use(express.static(frontendDirectory, { index: false }));
  app.get('/{*path}', (req, res) => {
    if (req.path.includes('.') || !existsSync(`${frontendDirectory}/index.html`)) {
      res.status(404).send('Frontend build not found. Run npm run build in frontend.');
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(`${frontendDirectory}/index.html`);
  });
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : 400;
    res.status(status).json({ error: status === 413 ? 'The image crop is too large.' : 'Invalid request body.' });
  };
  app.use(handleError);
  return app;
}
