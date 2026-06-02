import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { redactUrl } from '../http/fetch-helper.js';

const execFileAsync = promisify(execFile);

const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';

/**
 * @typedef {{ type: 'image' | 'video', url: string }} MediaItem
 */

/**
 * @returns {Promise<void>}
 */
export async function ensureYtdlp() {
  try {
    const { stdout } = await execFileAsync(YTDLP_BIN, ['--version']);
    console.log('[ytdlp] 已就绪:', stdout.trim().split('\n')[0]);
    return;
  } catch {
    console.log('[ytdlp] 未找到，正在通过 pip 安装…');
  }

  const pipArgs = ['install', '-q', 'yt-dlp'];
  try {
    await execFileAsync('pip3', ['install', '--break-system-packages', '-q', 'yt-dlp']);
  } catch {
    await execFileAsync('pip3', pipArgs);
  }

  const { stdout } = await execFileAsync(YTDLP_BIN, ['--version']);
  console.log('[ytdlp] 安装完成:', stdout.trim().split('\n')[0]);
}

/**
 * @param {string[]} args
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function runYtdlp(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    proc.on('error', (err) => reject(err));

    proc.on('close', (code) => {
      if (code !== 0) {
        const msg = stderr.trim() || stdout.trim() || `yt-dlp 退出码 ${code}`;
        reject(new Error(msg.slice(0, 500)));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

/**
 * @param {string} instagramUrl
 * @returns {Promise<MediaItem[]>}
 */
export async function fetchInstagramMedia(instagramUrl) {
  console.log('[ytdlp] 解析:', redactUrl(instagramUrl));

  const { stdout } = await runYtdlp([
    '-J',
    '--no-warnings',
    '--no-progress',
    instagramUrl,
  ]);

  let data;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new Error('yt-dlp JSON 解析失败');
  }

  const items = extractMediaItems(data);
  if (!items.length) {
    throw new Error('未找到可下载的媒体');
  }

  console.log('[ytdlp] 找到', items.length, '个媒体');
  return items;
}

/**
 * @param {object} data
 * @returns {MediaItem[]}
 */
function extractMediaItems(data) {
  const entries =
    data._type === 'playlist' && Array.isArray(data.entries)
      ? data.entries.filter(Boolean)
      : [data];

  /** @type {MediaItem[]} */
  const items = [];

  for (const entry of entries) {
    const url = pickDirectUrl(entry);
    if (!url) continue;

    items.push({
      type: isVideoEntry(entry) ? 'video' : 'image',
      url,
    });
  }

  return items;
}

/**
 * @param {object} entry
 */
function isVideoEntry(entry) {
  if (entry.vcodec && entry.vcodec !== 'none') return true;
  const ext = (entry.ext || '').toLowerCase();
  return ['mp4', 'webm', 'mov', 'm4v', 'mkv'].includes(ext);
}

/**
 * @param {object} item
 * @returns {string | null}
 */
function pickDirectUrl(item) {
  if (item.url && isDirectMediaUrl(item.url)) {
    return item.url;
  }

  const formats = [...(item.formats || []), ...(item.requested_formats || [])].filter(
    (f) => f?.url && isDirectMediaUrl(f.url),
  );

  if (!formats.length) return null;

  const videoFormats = formats
    .filter((f) => f.vcodec && f.vcodec !== 'none')
    .sort((a, b) => (b.height || 0) - (a.height || 0));

  if (isVideoEntry(item) && videoFormats.length) {
    return videoFormats[0].url;
  }

  const imageFormats = formats
    .filter((f) => !f.vcodec || f.vcodec === 'none')
    .sort((a, b) => (b.width || 0) - (a.width || 0));

  if (imageFormats.length) {
    return imageFormats[0].url;
  }

  return formats[formats.length - 1].url;
}

/**
 * @param {string} url
 */
function isDirectMediaUrl(url) {
  if (!url.startsWith('http')) return false;
  if (/\.m3u8/i.test(url)) return false;
  return true;
}
