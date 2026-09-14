import { defineConfig, devices } from '@playwright/test'

// Smoke-test config: runs against server.js (the real Express server this
// app deploys with — static HTML pages + api/ router) on a dedicated port to
// avoid colliding with a dev instance the user might already have running.
// No real Supabase session is used — these tests only cover what's reachable
// WITHOUT logging in (login form validation, public pages, auth redirects),
// same scope decision as Diet-Plan-Pro-app-claude/playwright.config.js.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5099',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:5099',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { PORT: '5099' },
  },
})
