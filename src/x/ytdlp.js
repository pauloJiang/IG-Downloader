import { spawn } from 'node:child_process';
import { getXCookieArgs } from './cookies.js';
import { isXAuthError } from './errors.js';

const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';

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
 * @param {string} message
 */
function mapXYtdlpError(message) {
  if (isXAuthError(message)) {
    return new Error('X 需要登录验证');
  }
  return new Error('X 视频下载失败');
}

/**
 * @param {string[]} args
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
export async function runXYtdlp(args) {
  const fullArgs = [...getXCookieArgs(), ...args];

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
        console.error('[X] yt-dlp stderr (last 1200 chars):\n', stderr.slice(-1200));
        reject(
          new YtdlpRunError(mapXYtdlpError(msg).message, {
            stderr,
            stdout,
            code,
          }),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
