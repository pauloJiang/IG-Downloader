import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { redactUrl } from '../http/fetch-helper.js';

const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';

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

  await runYtdlpDownload(mediaUrl, outTemplate, type);

  const filePath = await resolveDownloadedFile(id);
  scheduleDeletion(filePath);

  return { filePath, type };
}

/**
 * @param {string} mediaUrl
 * @param {string} outTemplate
 * @param {'image' | 'video'} type
 */
function runYtdlpDownload(mediaUrl, outTemplate, type) {
  return new Promise((resolve, reject) => {
    const args = ['-o', outTemplate, '--no-playlist', '--no-warnings', '--no-progress'];

    if (type === 'video') {
      args.push('-f', 'bv*+ba/b');
    }

    args.push(mediaUrl);

    const proc = spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    proc.on('error', reject);

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim().slice(0, 500) || `yt-dlp 下载失败 (${code})`));
        return;
      }
      resolve();
    });
  });
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
function scheduleDeletion(filePath) {
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
