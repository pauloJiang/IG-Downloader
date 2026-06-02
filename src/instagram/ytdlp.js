import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { redactUrl } from '../http/fetch-helper.js';
import { getYtdlpCookieArgs } from './cookies.js';

const execFileAsync = promisify(execFile);

const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';

export const IG_AUTH_ERROR =
  'Instagram 需要登录或当前IP被限流，请稍后再试或更新 cookies。';

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
  } catch {
    throw new Error('未找到 yt-dlp，请安装后重试');
  }
}

/**
 * @param {string} message
 */
export function mapYtdlpError(message) {
  const lower = message.toLowerCase();
  if (
    lower.includes('login required') ||
    lower.includes('rate-limit reached') ||
    lower.includes('rate limit') ||
    lower.includes('requested content is not available')
  ) {
    return new Error(IG_AUTH_ERROR);
  }
  return new Error(message);
}

/**
 * @param {string[]} args
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
export async function runYtdlp(args) {
  const fullArgs = [...getYtdlpCookieArgs(), ...args];

  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, fullArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
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
        reject(mapYtdlpError(msg.slice(0, 500)));
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

  const { stdout } = await runYtdlp(['-J', '--no-warnings', '--no-progress', instagramUrl]);

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
