import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

/** @type {Map<string, NodeJS.Timeout>} */
const deletionTimers = new Map();

/**
 * @param {string} dir
 */
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * @param {string} mediaUrl
 * @param {'image' | 'video'} type
 * @returns {Promise<{ filePath: string, type: 'image' | 'video' }>}
 */
export async function downloadToCache(mediaUrl, type) {
  await ensureDir(config.cacheDir);

  const ext = type === 'video' ? '.mp4' : '.jpg';
  const fileName = `${randomUUID()}${ext}`;
  const filePath = path.join(config.cacheDir, fileName);

  const response = await fetch(mediaUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Referer: 'https://www.instagram.com/',
    },
  });

  if (!response.ok) {
    throw new Error(`媒体下载失败 (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  scheduleDeletion(filePath);

  return { filePath, type };
}

/**
 * @param {string} filePath
 */
function scheduleDeletion(filePath) {
  const existing = deletionTimers.get(filePath);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    deletionTimers.delete(filePath);
    try {
      await fs.unlink(filePath);
    } catch {
      // file may already be removed
    }
  }, config.cacheTtlMs);

  timer.unref?.();
  deletionTimers.set(filePath, timer);
}

export async function initCacheDir() {
  await ensureDir(config.cacheDir);
}
