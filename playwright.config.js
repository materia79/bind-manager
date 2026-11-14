import { defineConfig } from '@playwright/test';

// BM_E2E_PORT gives each worktree its own server; a set port never reuses a running one.
const port = Number(process.env.BM_E2E_PORT) || 3001;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  use: {
    baseURL,
    headless: true,
  },
  webServer: {
    command: `npx serve . -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.BM_E2E_PORT,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
