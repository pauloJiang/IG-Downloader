import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { redactUrl } from '../http/fetch-helper.js';
import { runXYtdlp } from './ytdlp.js';

/** @type {Map<string, NodeJS.Timeout>} */
const deletionTimers = new Map();

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchXVideoId(url) {
  const { stdout } = await runXYtdlp([
    '--print',
    'id',
    '--no-playlist',
    '--no-warnings',
    '-s',
    url,
  ]);

  const id = stdout.trim();
  if (!id) {
    throw new Error('无法解析 X 视频 ID');
  }

  return id;
}

/**
 * @param {string} videoId
 * @returns {Promise<string>}
 */
async function resolveXDownloadedFile(videoId) {
  const files = await fs.readdir(config.xCacheDir);
  const match = files.find(
    (name) => name.startsWith(`${videoId}.`) && !name.endsWith('.part') && !name.endsWith('.ytdl'),
  );

  if (!match) {
    throw new Error('下载完成但未找到 X 缓存文件');
  }

  return path.join(config.xCacheDir, match);
}

/**
 * @param {string} filePath
 */
function scheduleXCacheDeletion(filePath) {
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

export async function initXCacheDir() {
  await fs.mkdir(config.xCacheDir, { recursive: true });
}

/**
 * @param {string} url
 * @returns {Promise<{ filePath: string }>}
 */
let xCacheReady = false;

async function ensureXCacheDir() {
  if (xCacheReady) return;
  await initXCacheDir();
  xCacheReady = true;
}

export async function downloadXVideo(url) {
  await ensureXCacheDir();

  const videoId = await fetchXVideoId(url);
  const outTemplate = path.join(config.xCacheDir, '%(id)s.%(ext)s');

  const args = [
    '--no-playlist',
    '-f',
    'bv*+ba/best',
    '--merge-output-format',
    'mp4',
    '-o',
    outTemplate,
    '--no-warnings',
    '--no-progress',
    url,
  ];

  console.log('[X] yt-dlp:', redactUrl(url), 'id=', videoId);
  console.log('[X] yt-dlp 命令:', args.filter((a) => !a.startsWith('http')).join(' '));

  await runXYtdlp(args);

  const filePath = await resolveXDownloadedFile(videoId);
  scheduleXCacheDeletion(filePath);

  return { filePath };
}
