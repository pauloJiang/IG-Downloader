import { spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { scheduleCacheDeletion } from '../cache/manager.js';
import { config } from '../config.js';

const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';

/**
 * @param {string} inputPath
 * @returns {Promise<string>} 转码后的 output.mp4 路径
 */
export async function transcodeForTelegram(inputPath) {
  const outputPath = path.join(
    config.cacheDir,
    `${randomUUID()}-telegram.mp4`,
  );

  console.log('[ffmpeg] 转码:', path.basename(inputPath), '->', path.basename(outputPath));

  try {
    await runFfmpeg(inputPath, outputPath);
  } catch (err) {
    const reason = err instanceof Error ? err.message : '未知错误';
    throw new Error(reason);
  }

  scheduleCacheDeletion(outputPath);
  return outputPath;
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 */
function runFfmpeg(inputPath, outputPath) {
  const args = [
    '-y',
    '-i',
    inputPath,
    '-c:v',
    'libx264',
    '-profile:v',
    'baseline',
    '-level',
    '3.1',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('未找到 ffmpeg，请安装后重试'));
        return;
      }
      reject(err);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const tail = stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300);
        reject(new Error(tail || `ffmpeg 退出码 ${code}`));
        return;
      }
      resolve();
    });
  });
}
