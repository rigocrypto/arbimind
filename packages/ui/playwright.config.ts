import { defineConfig, devices } from '@playwright/test';

// 3099 avoids collision with dev server on :3000. Override with E2E_PORT.
// next start reads process.env.PORT; Playwright passes env to the spawned process.
const E2E_PORT = process.env.E2E_PORT || '3099';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${E2E_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      process.platform === 'win32'
        ? 'pnpm build; pnpm start'
        : 'pnpm build && pnpm start',
    url: `http://localhost:${E2E_PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: String(E2E_PORT),
      PLAYWRIGHT: '1',
    },
  },
});
