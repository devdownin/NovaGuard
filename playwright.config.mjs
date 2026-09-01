import { defineConfig, devices } from '@playwright/test';

/* CI installs its own browsers. Sandboxes that ship a preinstalled Chromium
   can point at it instead by setting PLAYWRIGHT_CHROMIUM_PATH. */
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const launchOptions = chromiumPath ? { executablePath: chromiumPath } : {};

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,

  /* A stray test.only should fail the build, never silently shrink it. */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions
  },

  /* The page is a desktop stage that renders a phone frame, so it wants a
     desktop viewport rather than a mobile one. */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
