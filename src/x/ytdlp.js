import { spawn } from 'node:child_process';

const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';

export class XDownloadError extends Error {
  /**
   * @param {string} message
   * @param {string} [stderr]
   */
  constructor(message, stderr = '') {
    super(message);
    this.name = 'XDownloadError';
    this.stderr = stderr;
  }
}

/**
 * @param {string[]} args
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
export function runXYtdlp(args) {
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

    proc.on('error', (err) => {
      reject(new XDownloadError(err.message, stderr));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const msg = stderr.trim() || stdout.trim() || `yt-dlp 退出码 ${code}`;
        reject(new XDownloadError(msg.slice(0, 500), stderr));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
