import { defineConfig, devices } from '@playwright/test';

const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
const BACKEND_URL = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:8000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  metadata: {
    frontendUrl: FRONTEND_URL,
    backendUrl: BACKEND_URL,
  },
});
