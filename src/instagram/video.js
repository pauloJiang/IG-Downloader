import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { scheduleCacheDeletion } from '../cache/manager.js';
import { probeMedia } from '../video/ffprobe-log.js';

const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';
const MIN_VIDEO_BYTES = 100_000;

const INCOMPATIBLE_CODEC_LABELS = {
  vp9: 'VP9',
  hevc: 'HEVC',
  av1: 'AV1',
};

/**
 * @param {import('../video/ffprobe-log.js').MediaProbe} probe
 * @param {boolean} hasAudio
 */
function canIgDirectSend(probe, hasAudio) {
  if (!probe.video) return false;
  if (probe.video.codec_name !== 'h264') return false;
  if (probe.video.pix_fmt !== 'yuv420p') return false;
  if (hasAudio) {
    if (!probe.audio || probe.audio.codec_name !== 'aac') return false;
  }
  return true;
}

/**
 * @param {import('../video/ffprobe-log.js').MediaProbe} probe
 */
function getIncompatibleCodecLabel(probe) {
  const codec = probe.video?.codec_name?.toLowerCase();
  if (!codec) return null;
  return INCOMPATIBLE_CODEC_LABELS[codec] ?? null;
}

/**
 * @param {string} filePath
 */
function getFileSize(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  return fs.statSync(filePath).size;
}

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
}

/**
 * @param {import('../video/ffprobe-log.js').MediaProbe} probe
 * @param {boolean} requireAudio
 */
function assertIgOutputCompatible(probe, requireAudio) {
  if (!probe.video) {
    throw new Error('无视频流');
  }
  if (probe.video.codec_name !== 'h264') {
    throw new Error(`输出 video codec=${probe.video.codec_name ?? 'none'}`);
  }
  if (probe.video.pix_fmt !== 'yuv420p') {
    throw new Error(`输出 pix_fmt=${probe.video.pix_fmt ?? 'none'}`);
  }
  if (requireAudio && (!probe.audio || probe.audio.codec_name !== 'aac')) {
    throw new Error(`输出 audio codec=${probe.audio?.codec_name ?? 'none'}`);
  }
  const format = probe.format_name?.toLowerCase() ?? '';
  if (!format.includes('mp4') && !format.includes('mov')) {
    throw new Error(`输出 container=${probe.format_name ?? 'none'}`);
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
function transcodeToIgMp4(inputPath, outputPath, hasAudio) {
  const args = buildFfmpegArgs(inputPath, outputPath, hasAudio);

  console.log('[IG] ffmpeg:', FFMPEG_BIN, args.join(' '));

  const result = spawnSync(FFMPEG_BIN, args, {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });

  if (result.error?.code === 'ENOENT') {
    throw new Error('未找到 ffmpeg');
  }

  if (result.status !== 0) {
    console.error('[IG] FFMPEG_FULL_ERROR:', result.stderr);
    throw new Error(`FFmpeg 退出码 ${result.status}`);
  }
}

/**
 * @param {string} inputPath
 * @returns {Promise<string>} 发送用的文件路径
 */
export async function prepareIgVideoForSend(inputPath) {
  let probe;
  try {
    probe = await probeMedia(inputPath);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`ffprobe 失败: ${reason}`);
  }

  const hasAudio = Boolean(probe.audio);
  const inputSize = getFileSize(inputPath);

  if (!hasAudio) {
    console.log('🎬 视频无音频轨，已按静音视频处理');
  }

  console.log('[IG] ffprobe:', {
    file: path.basename(inputPath),
    size: inputSize,
    video_codec: probe.video?.codec_name,
    pix_fmt: probe.video?.pix_fmt,
    audio_codec: probe.audio?.codec_name ?? '(none)',
  });

  if (inputSize <= MIN_VIDEO_BYTES) {
    throw new Error(`原视频文件过小: ${inputSize} bytes`);
  }

  if (canIgDirectSend(probe, hasAudio)) {
    console.log('[IG] 原文件兼容，直接发送');
    return inputPath;
  }

  const codecLabel = getIncompatibleCodecLabel(probe);
  if (codecLabel) {
    console.log(`[IG] 原文件不兼容，开始转码 (${codecLabel})`);
  } else {
    console.log('[IG] 原文件不兼容，开始转码');
  }

  const outputPath = path.join(config.cacheDir, `${randomUUID()}-ios.mp4`);

  try {
    transcodeToIgMp4(inputPath, outputPath, hasAudio);
    await assertTranscodeOutput(outputPath);

    const outputProbe = await probeMedia(outputPath);
    assertIgOutputCompatible(outputProbe, hasAudio);

    scheduleCacheDeletion(outputPath);
    return outputPath;
  } catch (err) {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`IG 视频转码失败: ${reason}`);
  }
}
