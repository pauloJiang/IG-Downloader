import path from 'node:path';

const CACHE_DIR = process.env.CACHE_DIR || '/tmp/ig-cache';
const X_CACHE_DIR = process.env.X_CACHE_DIR || '/tmp/x-cache';
const CACHE_TTL_MS = 30 * 60 * 1000;
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

export const config = {
  botToken: process.env.BOT_TOKEN,
  adminTgId: process.env.ADMIN_TG_ID ? Number(process.env.ADMIN_TG_ID) : null,
  dataDir: DATA_DIR,
  cookiesPath: process.env.COOKIES_PATH || '/data/cookies.txt',
  whitelistPath: path.join(DATA_DIR, 'whitelist.json'),
  cacheDir: CACHE_DIR,
  xCacheDir: X_CACHE_DIR,
  cacheTtlMs: CACHE_TTL_MS,
};
