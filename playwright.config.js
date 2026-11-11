import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';
const dataDir = join(tmpdir(), `entre-livros-e2e-${process.pid}-${Date.now()}`);
const testPort = Number(process.env.TEST_PORT || 3101);
export default defineConfig({
  testDir: './tests',
  testMatch: 'ui.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    headless: true,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node --use-env-proxy server/index.mjs',
    url: `http://127.0.0.1:${testPort}/api/health`,
    env: { HOST: '127.0.0.1', PORT: String(testPort), DATA_DIR: dataDir },
    reuseExistingServer: false,
    timeout: 15000,
  },
});
