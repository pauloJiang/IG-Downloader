import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { listUsers } from './whitelist.js';

let lastProcessedAt = null;

export function markProcessed() {
  lastProcessedAt = new Date();
}

/**
 * @returns {Promise<{ cookieExists: boolean, cookieSizeKb: string, whitelistCount: number, cacheCount: number, lastProcessed: string }>}
 */
export async function getBotStatus() {
  const cookieExists = existsSync(config.cookiesPath);
  let cookieSizeKb = '0';
  if (cookieExists) {
    const stat = await fs.stat(config.cookiesPath);
    cookieSizeKb = (stat.size / 1024).toFixed(1);
  }

  let cacheCount = 0;
  if (existsSync(config.cacheDir)) {
    const files = await fs.readdir(config.cacheDir);
    cacheCount = files.length;
  }

  return {
    cookieExists,
    cookieSizeKb,
    whitelistCount: listUsers().length,
    cacheCount,
    lastProcessed: lastProcessedAt
      ? lastProcessedAt.toLocaleString('zh-CN', { hour12: false })
      : '暂无',
  };
}

/**
 * @returns {Promise<number>}
 */
export async function clearCacheFiles() {
  if (!existsSync(config.cacheDir)) {
    return 0;
  }

  const files = await fs.readdir(config.cacheDir);
  let deleted = 0;

  for (const name of files) {
    try {
      await fs.unlink(path.join(config.cacheDir, name));
      deleted++;
    } catch {
      // ignore
    }
  }

  return deleted;
}
