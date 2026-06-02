import { spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { scheduleCacheDeletion } from '../cache/manager.js';
import { probeMedia, logProbeResult } from './ffprobe-log.js';

const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';

/**
 * @param {{ video: import('./ffprobe-log.js').VideoStreamInfo | null, audio: import('./ffprobe-log.js').AudioStreamInfo | null }} probe
 */
function needsTranscode(probe) {
  if (probe.video?.codec_name !== 'h264') return true;
  if (probe.audio && probe.audio.codec_name !== 'aac') return true;
  return false;
}

/**
 * @param {string} inputPath
 * @returns {Promise<string>} 用于发送的视频路径
 */
export async function prepareVideoForTelegram(inputPath) {
  let before;
  try {
    before = await probeMedia(inputPath);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`ffprobe 失败: ${reason}`);
  }
  logProbeResult(inputPath, '发送前', before);

  if (!needsTranscode(before)) {
    console.log('[video] 已是 h264 + aac（或无音轨），直接发送');
    return inputPath;
  }

  console.log(
    '[video] 需要转码: 视频',
    before.video?.codec_name ?? 'none',
    '音频',
    before.audio?.codec_name ?? 'none',
  );

  const outputPath = path.join(config.cacheDir, `${randomUUID()}-h264.mp4`);
  await transcodeToH264(inputPath, outputPath);

  const after = await probeMedia(outputPath);
  logProbeResult(outputPath, '转码后', after);

  if (after.video?.codec_name !== 'h264' || after.video?.pix_fmt !== 'yuv420p') {
    throw new Error(
      `转码后视频验证失败: codec_name=${after.video?.codec_name ?? 'none'}, pix_fmt=${after.video?.pix_fmt ?? 'none'}`,
    );
  }

  if (before.audio) {
    if (after.audio?.codec_name !== 'aac') {
      throw new Error(
        `转码后音频验证失败: codec_name=${after.audio?.codec_name ?? 'none'}`,
      );
    }
    console.log('[video] 转码验证通过: codec_name=h264, codec_name=aac');
  } else {
    console.log('[video] 转码验证通过: codec_name=h264（无音频轨）');
  }

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
    '-b:a',
    '128k',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-movflags',
    '+faststart',
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
