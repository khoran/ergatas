// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  // Fail the build on CI if any test.only is accidentally left in
  forbidOnly: !!process.env.CI,
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  // Parallel workers
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    // Collect trace on first retry for debugging
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
