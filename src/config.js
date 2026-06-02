const CACHE_DIR = process.env.CACHE_DIR || '/tmp/ig-cache';
const CACHE_TTL_MS = 30 * 60 * 1000;

export const config = {
  botToken: process.env.BOT_TOKEN,
  cacheDir: CACHE_DIR,
  cacheTtlMs: CACHE_TTL_MS,
};
