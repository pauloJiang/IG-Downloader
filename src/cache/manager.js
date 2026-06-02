import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { redactUrl } from '../http/fetch-helper.js';
import { runYtdlp } from '../instagram/ytdlp.js';

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

  const id = randomUUID();
  const outTemplate = path.join(config.cacheDir, `${id}.%(ext)s`);

  console.log('[ytdlp] 下载:', redactUrl(mediaUrl), 'type=', type);

  const args = ['-o', outTemplate, '--no-playlist', '--no-warnings', '--no-progress'];
  if (type === 'video') {
    args.push('-f', 'bv*+ba/b');
  }
  args.push(mediaUrl);

  await runYtdlp(args);

  const filePath = await resolveDownloadedFile(id);
  scheduleCacheDeletion(filePath);

  return { filePath, type };
}

/**
 * @param {string} id
 * @returns {Promise<string>}
 */
async function resolveDownloadedFile(id) {
  const files = await fs.readdir(config.cacheDir);
  const match = files.find((name) => name.startsWith(`${id}.`));

  if (!match) {
    throw new Error('下载完成但未找到缓存文件');
  }

  return path.join(config.cacheDir, match);
}

/**
 * @param {string} filePath
 */
function scheduleCacheDeletion(filePath) {
  const existing = deletionTimers.get(filePath);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    deletionTimers.delete(filePath);
    try {
      await fs.unlink(filePath);
    } catch {
      // already removed
    }
  }, config.cacheTtlMs);

  timer.unref?.();
  deletionTimers.set(filePath, timer);
}

export async function initCacheDir() {
  await ensureDir(config.cacheDir);
}
