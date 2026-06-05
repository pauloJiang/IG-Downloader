import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

/**
 * @returns {Promise<void>}
 */
export async function initIgCookies() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(path.dirname(config.cookiesPath), { recursive: true }).catch(() => {});
}

/**
 * @returns {string[]}
 */
export function getYtdlpCookieArgs() {
  if (!existsSync(config.cookiesPath)) {
    return [];
  }
  return ['--cookies', config.cookiesPath];
}
