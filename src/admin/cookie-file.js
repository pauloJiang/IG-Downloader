import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { refreshIgCookieCache } from '../instagram/cookies.js';

/**
 * @param {string} content
 */
export function isValidCookieContent(content) {
  const lower = content.toLowerCase();
  return lower.includes('instagram.com') || lower.includes('sessionid');
}

/**
 * @param {string} content
 */
export async function saveCookieFile(content) {
  await fs.mkdir(path.dirname(config.cookiesPath), { recursive: true });
  await fs.writeFile(config.cookiesPath, content, 'utf8');
  refreshIgCookieCache();
}
