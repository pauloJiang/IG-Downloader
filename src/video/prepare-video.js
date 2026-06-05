import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { scheduleCacheDeletion } from '../cache/manager.js';
import {
  probeMedia,
  logProbeResult,
  validateIosMp4,
  isIosMp4Compatible,
} from './ffprobe-log.js';

const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';
const MIN_VIDEO_BYTES = 100_000;

/**
 * @typedef {{ path: string, sendAs: 'video' | 'document' }} PreparedVideo
 */

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} filePath
 */
function getFileSize(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  return fs.statSync(filePath).size;
}

/**
 * @param {string} outputPath
 */
async function assertTranscodeOutput(outputPath) {
  await sleep(1000);

  if (!fs.existsSync(outputPath)) {
    throw new Error('转码输出文件不存在');
  }

  const size = fs.statSync(outputPath).size;
  if (size <= MIN_VIDEO_BYTES) {
    throw new Error(`转码输出过小: ${size} bytes`);
  }

  console.log('[video] 转码输出有效, size=', size);
}

/**
 * @param {string} filePath
 * @param {boolean} requireAudio
 */
async function assertIosMp4BeforeSend(filePath, requireAudio) {
  const probe = await probeMedia(filePath);
  logProbeResult(filePath, '发送前验证', probe);
  validateIosMp4(probe, requireAudio);
  console.log('[video] iOS/Telegram 兼容性验证通过');
}

/**
 * @param {string} inputPath
 * @returns {Promise<PreparedVideo>}
 */
export async function prepareVideoForTelegram(inputPath) {
  let before;
  try {
    before = await probeMedia(inputPath);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`ffprobe 失败: ${reason}`);
  }

  const hasAudio = Boolean(before.audio);
  const inputSize = getFileSize(inputPath);

  if (!hasAudio) {
    console.log('🎬 视频无音频轨，已按静音视频处理');
  }

  console.log('[video] 输入检测:', {
    file: path.basename(inputPath),
    size: inputSize,
    hasAudio,
  });
  logProbeResult(inputPath, '输入', before);

  if (inputSize <= MIN_VIDEO_BYTES) {
    throw new Error(`原视频文件过小: ${inputSize} bytes`);
  }

  if (isIosMp4Compatible(before, hasAudio)) {
    console.log('[video] 已符合 iOS MP4 规范，直接发送');
    await assertIosMp4BeforeSend(inputPath, hasAudio);
    return { path: inputPath, sendAs: 'video' };
  }

  const outputPath = path.join(config.cacheDir, `${randomUUID()}-ios.mp4`);
  console.log('[video] 开始转码为 iOS 兼容 MP4, hasAudio=', hasAudio);

  try {
    transcodeToIosMp4(inputPath, outputPath, hasAudio);
    await assertTranscodeOutput(outputPath);
    await assertIosMp4BeforeSend(outputPath, hasAudio);
    scheduleCacheDeletion(outputPath);
    return { path: outputPath, sendAs: 'video' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn('[video] 转码/验证失败，改用原视频 document 发送:', reason);

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    return { path: inputPath, sendAs: 'document' };
  }
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {boolean} hasAudio
 */
function buildFfmpegArgs(inputPath, outputPath, hasAudio) {
  const args = [
    '-y',
    '-i',
    inputPath,
    '-vf',
    'scale=720:-2,fps=30,format=yuv420p',
    '-c:v',
    'libx264',
    '-profile:v',
    'baseline',
    '-level',
    '3.1',
    '-preset',
    'veryfast',
    '-crf',
    '23',
  ];

  if (hasAudio) {
    args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2');
  } else {
    args.push('-an');
  }

  args.push('-movflags', '+faststart', '-brand', 'mp42', outputPath);
  return args;
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {boolean} hasAudio
 */
function transcodeToIosMp4(inputPath, outputPath, hasAudio) {
  const args = buildFfmpegArgs(inputPath, outputPath, hasAudio);

  console.log('[ffmpeg] 命令:', FFMPEG_BIN, args.join(' '));

  const result = spawnSync(FFMPEG_BIN, args, {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });

  if (result.error?.code === 'ENOENT') {
    throw new Error('未找到 ffmpeg');
  }

  if (result.status !== 0) {
    console.error('FFMPEG_FULL_ERROR:', result.stderr);
    throw new Error(`FFmpeg 退出码 ${result.status}`);
  }

  console.log('[ffmpeg] 进程已结束, exit=0');
}
