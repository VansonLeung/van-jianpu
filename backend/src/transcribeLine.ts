import sharp from 'sharp';
import { z } from 'zod';
import { configuration } from './configuration.js';
import { normalizeTranscription, transcriptionPrompt } from './transcriptionPrompt.js';

export const scanRequestSchema = z.object({
  image: z.string().max(16_000_000).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
  settings: z.object({
    baseUrl: z.url().max(2000).optional(),
    model: z.string().trim().min(1).max(300).optional(),
    apiKey: z.string().max(4000).optional(),
  }).optional(),
});

export async function transcribeLine(input: z.infer<typeof scanRequestSchema>, signal: AbortSignal) {
  const baseUrl = (input.settings?.baseUrl ?? configuration.baseUrl).replace(/\/+$/, '');
  const model = input.settings?.model ?? configuration.model;
  if (!baseUrl || !model) throw new Error('Set the LLM base URL and model in Settings or in .env.');
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('The base URL must be an HTTP(S) URL without credentials, a query, or a fragment.');
  }
  // Never forward the server's key to a different endpoint configured by a browser.
  const usesDefaultEndpoint = baseUrl === configuration.baseUrl.replace(/\/+$/, '');
  const apiKey = input.settings?.apiKey || (usesDefaultEndpoint ? configuration.apiKey : '');
  const isLingModel = /ling-3[.\-]/i.test(model);
  const thinking = configuration.thinking === 'enabled' ? true : configuration.thinking === 'disabled' || isLingModel ? false : undefined;
  const buffer = Buffer.from(input.image.split(',')[1], 'base64');
  const metadata = await sharp(buffer, { limitInputPixels: 24_000_000 }).metadata();
  if (!['png', 'jpeg', 'webp'].includes(metadata.format || '') || !metadata.width || !metadata.height) {
    throw new Error('The crop is not a valid PNG, JPEG, or WebP image.');
  }
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: transcriptionPrompt },
        { role: 'user', content: [
          { type: 'text', text: 'Transcribe this one line of Jianpu using the specified notation.' },
          { type: 'image_url', image_url: { url: input.image } },
        ] },
      ],
      max_tokens: configuration.maxTokens,
      temperature: isLingModel ? 0.6 : 0,
      ...(thinking !== undefined ? { reasoning: { enabled: thinking } } : {}),
      ...(isLingModel && thinking !== undefined ? { chat_template_kwargs: { enable_thinking: thinking } } : {}),
    }),
  });
  if (!response.ok) {
    // Provider error bodies may echo credentials or request images.
    throw new Error(`LLM request failed (HTTP ${response.status}). Check the endpoint, model, key, or provider quota.`);
  }
  const result = await response.json() as { choices?: { finish_reason?: string; message?: { content?: unknown } }[] };
  const choice = result.choices?.[0];
  if (choice?.finish_reason === 'length') throw new Error('The model response was truncated. Try a narrower crop.');
  if (typeof choice?.message?.content !== 'string') throw new Error('The model returned no text. Check that the selected model supports images.');
  return normalizeTranscription(choice.message.content);
}
