import { defineConfig, devices } from '@playwright/test';

// The suite owns its server (see tests/e2e/server.ts) because one test stops and restarts it.
// Only port 3100 is used.
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  // One worker: every test resets the same server and database file.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'id-ID',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
