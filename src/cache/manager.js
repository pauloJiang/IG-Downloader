import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { redactUrl } from '../http/fetch-helper.js';
import { runYtdlp } from '../instagram/ytdlp.js';
import { probeMedia } from '../video/ffprobe-log.js';

/** @type {Map<string, NodeJS.Timeout>} */
const deletionTimers = new Map();

/**
 * @param {string} dir
 */
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * @param {string} outTemplate
 * @param {string} downloadUrl
 * @param {'image' | 'video'} type
 * @param {{ playlistIndex?: number }} [options]
 */
function buildYtdlpDownloadArgs(outTemplate, downloadUrl, type, options = {}) {
  const args = [
    '-o',
    outTemplate,
    '--no-warnings',
    '--no-progress',
  ];

  if (type === 'video') {
    args.push(
      '-f',
      'bv*+ba/b',
      '--merge-output-format',
      'mp4',
    );
    if (options.playlistIndex) {
      args.push('--playlist-items', String(options.playlistIndex));
    } else {
      args.push('--no-playlist');
    }
  } else {
    args.push('--no-playlist');
    if (options.playlistIndex) {
      args.push('--playlist-items', String(options.playlistIndex));
    }
  }

  args.push(downloadUrl);
  return args;
}

/**
 * @param {string} downloadUrl
 * @param {'image' | 'video'} type
 * @param {{ playlistIndex?: number }} [options]
 * @returns {Promise<{ filePath: string, type: 'image' | 'video', probe?: import('../video/ffprobe-log.js').MediaProbe, probeInputMs?: number }>}
 */
export async function downloadToCache(downloadUrl, type, options = {}) {
  await ensureDir(config.cacheDir);

  const id = randomUUID();
  const outTemplate = path.join(config.cacheDir, `${id}.%(ext)s`);

  console.log('[IG] 下载:', redactUrl(downloadUrl), 'type=', type, 'item=', options.playlistIndex ?? 'all');

  const args = buildYtdlpDownloadArgs(outTemplate, downloadUrl, type, options);
  console.log('[IG] yt-dlp 命令:', args.filter((a) => !a.startsWith('http')).join(' '));

  await runYtdlp(args);

  const filePath = await resolveDownloadedFile(id);

  if (type === 'video') {
    const probeStart = Date.now();
    const probe = await probeMedia(filePath);
    const probeInputMs = Date.now() - probeStart;

    console.log('[IG] post-download probe:', {
      video_codec: probe.video?.codec_name,
      pix_fmt: probe.video?.pix_fmt,
      audio_codec: probe.audio?.codec_name ?? '(none)',
      width: probe.video?.width,
      height: probe.video?.height,
    });

    scheduleCacheDeletion(filePath);
    return { filePath, type, probe, probeInputMs };
  }

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
export function scheduleCacheDeletion(filePath) {
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
