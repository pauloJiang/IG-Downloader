import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

/** @type {string[]} */
let cachedIgCookieArgs = [];

/**
 * @returns {Promise<void>}
 */
export async function initIgCookies() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(path.dirname(config.cookiesPath), { recursive: true }).catch(() => {});
  refreshIgCookieCache();
}

/**
 * 启动时及 uploadcookie 后刷新，避免每条消息 existsSync。
 */
export function refreshIgCookieCache() {
  if (!existsSync(config.cookiesPath)) {
    cachedIgCookieArgs = [];
    console.log('[IG] Cookie cache: not available');
    return;
  }

  cachedIgCookieArgs = ['--cookies', config.cookiesPath];
  console.log('[IG] Cookie cache: loaded');
}

/**
 * @returns {string[]}
 */
export function getYtdlpCookieArgs() {
  return cachedIgCookieArgs;
}

/**
 * @returns {boolean}
 */
export function igCookieCached() {
  return cachedIgCookieArgs.length > 0;
}
