import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { redactUrl } from '../http/fetch-helper.js';
import { runYtdlp } from '../instagram/ytdlp.js';
import { scheduleCacheDeletion } from '../cache/manager.js';
import { logDownloadStreams, hasAudioStream } from '../video/ffprobe-log.js';

/**
 * @param {string} id
 * @returns {Promise<string>}
 */
async function resolveXLargestFile(id) {
  const files = await fs.readdir(config.cacheDir);
  const matches = files.filter((name) => name.startsWith(`${id}.`));

  if (!matches.length) {
    throw new Error('下载完成但未找到缓存文件');
  }

  let largest = matches[0];
  let largestSize = 0;

  for (const name of matches) {
    const filePath = path.join(config.cacheDir, name);
    const stat = await fs.stat(filePath);
    if (stat.size > largestSize) {
      largestSize = stat.size;
      largest = name;
    }
  }

  console.log('[x] 选用最大文件:', largest, 'size=', largestSize);
  return path.join(config.cacheDir, largest);
}

/**
 * @param {string} url
 * @returns {Promise<{ filePath: string, type: 'video' }>}
 */
export async function downloadXVideo(url) {
  await fs.mkdir(config.cacheDir, { recursive: true });

  const id = randomUUID();
  const outTemplate = path.join(config.cacheDir, `${id}.%(ext)s`);

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

  console.log('[x] 下载视频:', redactUrl(url));
  console.log('[x] yt-dlp 命令:', args.filter((a) => !a.startsWith('http')).join(' '));

  await runYtdlp(args, { platform: 'x', useCookies: false });

  const filePath = await resolveXLargestFile(id);
  await logDownloadStreams(filePath);

  if (!(await hasAudioStream(filePath))) {
    console.log('🎬 视频无音频轨，已按静音视频处理');
  }

  scheduleCacheDeletion(filePath);
  return { filePath, type: 'video' };
}
