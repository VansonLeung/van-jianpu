import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

export const configuration = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3001),
  baseUrl: process.env.LLM_BASE_URL || '',
  model: process.env.LLM_MODEL || '',
  apiKey: process.env.LLM_API_KEY || '',
  provider: process.env.LLM_PROVIDER || 'openai-compatible',
  maxTokens: Number(process.env.LLM_MAX_TOKENS || 16384),
  thinking: process.env.LLM_THINKING || 'auto',
};
