import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { config } from '../config.js';

/**
 * @returns {Promise<void>}
 */
export async function initIgCookies() {
  if (!config.igCookies) {
    return;
  }

  await fs.writeFile(config.cookiesPath, config.igCookies, 'utf8');
  console.log('[cookies] 已写入 cookies 文件');
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
