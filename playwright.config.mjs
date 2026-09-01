import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* CI installs its own browsers. Sandboxes that ship a preinstalled Chromium
   can point at it instead by setting PLAYWRIGHT_CHROMIUM_PATH. */
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const launchOptions = chromiumPath ? { executablePath: chromiumPath } : {};

const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',

  /* The tests drive one shared panel, so they run in sequence and reset it
     between cases rather than racing each other through its state machine. */
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],

  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions
  },

  webServer: {
    command: 'node server/index.js',
    url: `${BASE}/api/state`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      /* Enables POST /api/test/reset, which is not routed otherwise. */
      SENTINELLE_TEST: '1',
      /* Long enough to observe the countdown, short enough to wait out. */
      SENTINELLE_EXIT_DELAY: '3',
      /* Keep the suite from writing into the repo's own state file. */
      SENTINELLE_STATE_FILE: join(tmpdir(), 'sentinelle-test-state.json')
    }
  },

  /* The page is a desktop stage that renders a phone frame, so it wants a
     desktop viewport rather than a mobile one. */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
