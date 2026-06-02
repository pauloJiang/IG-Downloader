import { spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { scheduleCacheDeletion } from '../cache/manager.js';
import { probeVideo, logProbeResult } from './ffprobe-log.js';

const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';

/**
 * @param {string} inputPath
 * @returns {Promise<string>} 用于发送的视频路径
 */
export async function prepareVideoForTelegram(inputPath) {
  let before;
  try {
    before = await probeVideo(inputPath);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`ffprobe 失败: ${reason}`);
  }
  logProbeResult(inputPath, '发送前', before);

  if (before.video?.codec_name === 'h264') {
    console.log('[video] codec 已是 h264，直接发送');
    return inputPath;
  }

  console.log(
    '[video] 需要转码:',
    before.video?.codec_name ?? 'unknown',
    '-> h264',
  );

  const outputPath = path.join(config.cacheDir, `${randomUUID()}-h264.mp4`);
  await transcodeToH264(inputPath, outputPath);

  const after = await probeVideo(outputPath);
  logProbeResult(outputPath, '转码后', after);

  if (after.video?.codec_name !== 'h264' || after.video?.pix_fmt !== 'yuv420p') {
    throw new Error(
      `转码后验证失败: codec_name=${after.video?.codec_name ?? 'none'}, pix_fmt=${after.video?.pix_fmt ?? 'none'}`,
    );
  }

  console.log('[video] 转码验证通过: h264 / yuv420p');
  scheduleCacheDeletion(outputPath);
  return outputPath;
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 */
function transcodeToH264(inputPath, outputPath) {
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
    '-c:a',
    'aac',
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
        reject(new Error('未找到 ffmpeg'));
        return;
      }
      reject(err);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim().slice(-300) || `ffmpeg 退出码 ${code}`));
        return;
      }
      resolve();
    });
  });
}
