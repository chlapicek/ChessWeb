import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: true,
  workers: process.env.E2E_ALLOW_MUTATING_API === '1' ? 1 : undefined,
  reporter: 'list',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI && !process.env.API_BASE_URL,
    timeout: 120000,
    env: {
      VITE_API_PROXY_TARGET: process.env.API_BASE_URL ?? 'http://localhost:8080',
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
