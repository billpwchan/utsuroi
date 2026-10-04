// The scripts drive a headed Chromium, since WebGL2 needs the real GPU. CHROME=<path> picks the binary; otherwise
// Playwright's own Chromium when it is installed (npx playwright-core install chromium), else the system Chrome.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

export function launch(args = [], { system = false } = {}) {
  const exe = process.env.CHROME || (!system && chromium.executablePath());
  const pick = exe && existsSync(exe) ? { executablePath: exe } : { channel: 'chrome' };
  return chromium.launch({ headless: false, ...pick, args: ['--ignore-gpu-blocklist', ...args] });
}
