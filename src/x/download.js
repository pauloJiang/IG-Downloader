import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { redactUrl } from '../http/fetch-helper.js';
import { runXYtdlp } from './ytdlp.js';
import { scheduleCacheDeletion } from '../cache/manager.js';
import { logDownloadStreams, hasAudioStream } from '../video/ffprobe-log.js';
import { xCookieExists } from './cookies.js';

const MIN_VIDEO_BYTES = 100_000;

/**
 * @param {string} label
 * @param {string} filePath
 */
function logFileState(label, filePath) {
  const fileExists = fs.existsSync(filePath);
  const fileSize = fileExists ? fs.statSync(filePath).size : 0;
  console.log(`[X] ${label}:`, { outputPath: filePath, fileExists, fileSize });
  return { fileExists, fileSize };
}

/**
 * @param {boolean} usingCookies
 * @param {string} outTemplate
 * @param {string} url
 */
function buildXDownloadArgs(usingCookies, outTemplate, url) {
  const format = usingCookies ? 'bestvideo+bestaudio/best' : 'bv*+ba/best';
  return [
    '--no-playlist',
    '-f',
    format,
    '--merge-output-format',
    'mp4',
    '-o',
    outTemplate,
    '--no-warnings',
    '--no-progress',
    url,
  ];
}

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
async function resolveXFileById(videoId) {
  const files = await fsPromises.readdir(config.cacheDir);
  const matches = files.filter((name) => name.startsWith(`${videoId}.`));

  if (!matches.length) {
    throw new Error('下载完成但未找到缓存文件');
  }

  let largest = matches[0];
  let largestSize = 0;

  for (const name of matches) {
    const filePath = path.join(config.cacheDir, name);
    const stat = await fsPromises.stat(filePath);
    if (stat.size > largestSize) {
      largestSize = stat.size;
      largest = name;
    }
  }

  return path.join(config.cacheDir, largest);
}

/**
 * @param {string} url
 * @returns {Promise<{ filePath: string, type: 'video' }>}
 */
export async function downloadXVideo(url) {
  await fsPromises.mkdir(config.cacheDir, { recursive: true });

  const usingCookies = xCookieExists();
  console.log(`[X] Using X Cookies: ${usingCookies}`);

  const outTemplate = path.join(config.cacheDir, '%(id)s.%(ext)s');
  const args = buildXDownloadArgs(usingCookies, outTemplate, url);

  console.log('[X] download:', redactUrl(url));
  console.log('[X] yt-dlp 命令:', args.filter((a) => !a.startsWith('http')).join(' '));

  const videoId = await fetchXVideoId(url);

  /** @type {Error | null} */
  let ytdlpError = null;
  try {
    await runXYtdlp(args);
  } catch (err) {
    ytdlpError = err instanceof Error ? err : new Error(String(err));
    console.warn('[X] yt-dlp 下载报错，尝试使用已落盘文件:', ytdlpError.message);
  }

  const filePath = await resolveXFileById(videoId);
  const { fileExists, fileSize } = logFileState('下载完成', filePath);

  if (fileExists && fileSize > MIN_VIDEO_BYTES) {
    if (ytdlpError) {
      console.warn('[X] yt-dlp 报错但文件有效 (>100KB)，继续处理');
    }

    await logDownloadStreams(filePath);

    if (!(await hasAudioStream(filePath))) {
      console.log('🎬 视频无音频轨，已按静音视频处理');
    }

    scheduleCacheDeletion(filePath);
    return { filePath, type: 'video' };
  }

  if (ytdlpError) {
    throw ytdlpError;
  }

  throw new Error(`下载文件无效: size=${fileSize} bytes`);
}
