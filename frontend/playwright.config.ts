import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3101', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  webServer: {
    command: 'npm --prefix ../backend run start',
    url: 'http://127.0.0.1:3101/api/health',
    env: { PORT: '3101', LLM_BASE_URL: 'http://127.0.0.1:5321/v1', LLM_MODEL: 'test-vision-model', LLM_API_KEY: 'test-backend-key' },
    reuseExistingServer: false,
  },
});
