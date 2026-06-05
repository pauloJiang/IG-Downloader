import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { redactUrl } from '../http/fetch-helper.js';
import { getYtdlpCookieArgs } from './cookies.js';

const execFileAsync = promisify(execFile);

const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';

export const IG_AUTH_ERROR =
  'Instagram 需要登录或当前IP被限流，请稍后再试或更新 cookies。';

/** @typedef {'instagram' | 'x'} YtdlpPlatform */

export class YtdlpRunError extends Error {
  /**
   * @param {string} message
   * @param {{ stderr?: string, stdout?: string, code?: number | null }} [details]
   */
  constructor(message, details = {}) {
    super(message);
    this.name = 'YtdlpRunError';
    this.stderr = details.stderr ?? '';
    this.stdout = details.stdout ?? '';
    this.code = details.code ?? null;
  }
}

/**
 * @typedef {{ type: 'image' | 'video', url: string, playlistIndex?: number }} MediaItem
 */

/**
 * @returns {Promise<void>}
 */
export async function ensureYtdlp() {
  try {
    const { stdout, stderr } = await execFileAsync(YTDLP_BIN, ['--version']);
    const version = (stdout || stderr).trim();
    console.log('[ytdlp] yt-dlp --version');
    console.log(version);
    console.log('[ytdlp] 已就绪:', version.split('\n')[0]);
  } catch {
    throw new Error('未找到 yt-dlp，请安装后重试');
  }
}

/**
 * @param {string} message
 * @param {YtdlpPlatform} [platform]
 */
export function mapYtdlpError(message, platform = 'instagram') {
  if (platform === 'x') {
    return new Error('X 视频下载失败');
  }

  const lower = message.toLowerCase();
  if (
    lower.includes('login required') ||
    lower.includes('rate-limit reached') ||
    lower.includes('rate limit') ||
    lower.includes('requested content is not available') ||
    lower.includes('cookies') ||
    lower.includes('account credentials')
  ) {
    return new Error(IG_AUTH_ERROR);
  }
  return new Error(message);
}

/**
 * @param {string[]} args
 * @param {{ platform?: YtdlpPlatform, useCookies?: boolean }} [options]
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
export async function runYtdlp(args, options = {}) {
  const platform = options.platform ?? 'instagram';
  const useCookies = options.useCookies ?? platform !== 'x';
  const fullArgs = [...(useCookies ? getYtdlpCookieArgs() : []), ...args];

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

        if (platform === 'x') {
          console.error('[x] yt-dlp stderr (last 1200 chars):\n', stderr.slice(-1200));
          reject(
            new YtdlpRunError(mapYtdlpError(msg, platform).message, {
              stderr,
              stdout,
              code,
            }),
          );
          return;
        }

        reject(mapYtdlpError(msg.slice(0, 500), platform));
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

  const items = extractMediaItems(data, instagramUrl);
  if (!items.length) {
    throw new Error('未找到可下载的媒体');
  }

  console.log('[ytdlp] 找到', items.length, '个媒体');
  return items;
}

/**
 * @param {object} data
 * @param {string} instagramUrl
 * @returns {MediaItem[]}
 */
function extractMediaItems(data, instagramUrl) {
  const entries =
    data._type === 'playlist' && Array.isArray(data.entries)
      ? data.entries.filter(Boolean)
      : [data];

  const isCarousel = entries.length > 1;

  /** @type {MediaItem[]} */
  const items = [];

  entries.forEach((entry, index) => {
    if (isVideoEntry(entry)) {
      items.push({
        type: 'video',
        url: instagramUrl,
        playlistIndex: isCarousel ? index + 1 : undefined,
      });
      return;
    }

    if (pickImageUrl(entry)) {
      items.push({
        type: 'image',
        url: instagramUrl,
        playlistIndex: isCarousel ? index + 1 : undefined,
      });
    }
  });

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
function pickImageUrl(item) {
  if (item.url && isDirectMediaUrl(item.url) && !isVideoEntry(item)) {
    return item.url;
  }

  const formats = [...(item.formats || []), ...(item.requested_formats || [])].filter(
    (f) => f?.url && isDirectMediaUrl(f.url) && (!f.vcodec || f.vcodec === 'none'),
  );

  if (!formats.length) return null;

  const imageFormats = formats.sort((a, b) => (b.width || 0) - (a.width || 0));
  return imageFormats[0].url;
}

/**
 * @param {string} url
 */
function isDirectMediaUrl(url) {
  if (!url.startsWith('http')) return false;
  if (/\.m3u8/i.test(url)) return false;
  return true;
}
