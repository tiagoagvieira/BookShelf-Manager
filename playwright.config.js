import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
const dataDir = `/tmp/entre-livros-e2e-${process.pid}-${Date.now()}`;
export default defineConfig({
  testDir: './tests',
  testMatch: 'ui.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3101',
    headless: true,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node --use-env-proxy server/index.mjs',
    url: 'http://127.0.0.1:3101/api/health',
    env: { HOST: '127.0.0.1', PORT: '3101', DATA_DIR: dataDir },
    reuseExistingServer: false,
    timeout: 15000,
  },
});
