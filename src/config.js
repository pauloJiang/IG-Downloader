const CACHE_DIR = process.env.CACHE_DIR || '/tmp/ig-cache';
const CACHE_TTL_MS = 30 * 60 * 1000;
const COOKIES_PATH = '/tmp/ig-cookies.txt';

export const config = {
  botToken: process.env.BOT_TOKEN,
  igCookies: process.env.IG_COOKIES,
  cookiesPath: COOKIES_PATH,
  cacheDir: CACHE_DIR,
  cacheTtlMs: CACHE_TTL_MS,
};
