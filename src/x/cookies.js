import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

/**
 * @returns {Promise<void>}
 */
export async function initXCookies() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(path.dirname(config.xCookiesPath), { recursive: true }).catch(() => {});
}

/**
 * @returns {boolean}
 */
export function xCookieExists() {
  return existsSync(config.xCookiesPath);
}

export function logXCookiesStartup() {
  console.log(`X Cookie Exists: ${xCookieExists()}`);
}

/**
 * @returns {string[]}
 */
export function getXCookieArgs() {
  if (!xCookieExists()) {
    return [];
  }
  return ['--cookies', config.xCookiesPath];
}

/**
 * @param {string} content
 */
export function isValidXCookieContent(content) {
  const lower = content.toLowerCase();
  return (
    lower.includes('x.com') ||
    lower.includes('twitter.com') ||
    lower.includes('auth_token') ||
    lower.includes('ct0')
  );
}

/**
 * @param {string} content
 */
export async function saveXCookieFile(content) {
  await fs.mkdir(path.dirname(config.xCookiesPath), { recursive: true });
  await fs.writeFile(config.xCookiesPath, content, 'utf8');
}
