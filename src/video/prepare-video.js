import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { scheduleCacheDeletion } from '../cache/manager.js';
import {
  probeMedia,
  logProbeResult,
  canSendWithoutTranscode,
  canIgSkipTranscode,
} from './ffprobe-log.js';

const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';
const MIN_VIDEO_BYTES = 100_000;
const IG_VIDEO_SCALE_FILTER =
  "scale='if(gt(iw,720),720,iw)':-2,fps=30,format=yuv420p";
const X_VIDEO_SCALE_FILTER =
  "scale='if(gt(iw,1080),1080,iw)':-2,fps=30,format=yuv420p";
const IG_ENCODE = { profile: 'baseline', level: '3.1', preset: 'veryfast', crf: '23' };
export const IG_ASPECT_RATIO_ERROR = '视频比例异常，已取消发送';
const X_ENCODE = { profile: 'main', level: '4.0', preset: 'veryfast', crf: '23' };
const ASPECT_RATIO_MAX_DRIFT = 0.01;

/** @typedef {'instagram' | 'x'} VideoPlatform */
/** @typedef {{ profile: string, level: string, preset: string, crf: string }} EncodeOptions */

/**
 * @typedef {{ probeInputMs: number, ffmpegMs: number, probeOutputMs: number }} VideoPerfStats
 * @typedef {{ path: string, sendAs: 'video' | 'document', perf?: VideoPerfStats }} PreparedVideo
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
 * @param {number | undefined} width
 * @param {number | undefined} height
 */
function getAspectRatio(width, height) {
  if (!width || !height) return null;
  return width / height;
}

/**
 * @param {import('./ffprobe-log.js').MediaProbe} inputProbe
 * @param {import('./ffprobe-log.js').MediaProbe} outputProbe
 * @param {{ logTag?: string, aspectRatioError?: string }} [options]
 */
function assertAspectRatioPreserved(inputProbe, outputProbe, options = {}) {
  const logTag = options.logTag ?? '[x]';
  const inW = inputProbe.video?.width;
  const inH = inputProbe.video?.height;
  const outW = outputProbe.video?.width;
  const outH = outputProbe.video?.height;

  console.log(`${logTag} 发送前尺寸对比:`, {
    input: { width: inW, height: inH },
    output: { width: outW, height: outH },
  });

  const inRatio = getAspectRatio(inW, inH);
  const outRatio = getAspectRatio(outW, outH);
  if (!inRatio || !outRatio) {
    throw new Error('无法获取视频宽高，比例校验失败');
  }

  const drift = Math.abs(inRatio - outRatio) / inRatio;
  console.log(`${logTag} 宽高比:`, {
    input: inRatio.toFixed(6),
    output: outRatio.toFixed(6),
    driftPercent: `${(drift * 100).toFixed(3)}%`,
  });

  if (drift > ASPECT_RATIO_MAX_DRIFT) {
    throw new Error(
      options.aspectRatioError ??
        `比例异常: 输入 ${inW}x${inH} → 输出 ${outW}x${outH}，偏差 ${(drift * 100).toFixed(2)}%`,
    );
  }
}

/**
 * @param {import('./ffprobe-log.js').MediaProbe} inputProbe
 * @param {string} outputPath
 */
async function assertIgVideoBeforeSend(inputProbe, outputPath) {
  const outputProbe = await probeMedia(outputPath);
  logProbeResult(outputPath, 'IG 发送前验证', outputProbe);
  assertAspectRatioPreserved(inputProbe, outputProbe, {
    logTag: '[IG]',
    aspectRatioError: IG_ASPECT_RATIO_ERROR,
  });
  console.log('[IG] 转码输出验证通过');
}

/**
 * @param {import('./ffprobe-log.js').MediaProbe} inputProbe
 * @param {string} outputPath
 * @param {boolean} requireAudio
 */
async function assertXVideoBeforeSend(inputProbe, outputPath, requireAudio) {
  const outputProbe = await probeMedia(outputPath);
  logProbeResult(outputPath, 'X 发送前验证', outputProbe);
  assertAspectRatioPreserved(inputProbe, outputProbe);

  if (!outputProbe.video) {
    throw new Error('无视频流');
  }
  if (outputProbe.video.codec_name !== 'h264') {
    throw new Error(`video codec=${outputProbe.video.codec_name ?? 'none'}，需要 h264`);
  }
  if (outputProbe.video.pix_fmt !== 'yuv420p') {
    throw new Error(`pix_fmt=${outputProbe.video.pix_fmt ?? 'none'}，需要 yuv420p`);
  }
  if (requireAudio && (!outputProbe.audio || outputProbe.audio.codec_name !== 'aac')) {
    throw new Error(`audio codec=${outputProbe.audio?.codec_name ?? 'none'}，需要 aac`);
  }

  console.log('[x] 转码输出验证通过');
}

/**
 * @param {string} inputPath
 * @param {{ platform?: VideoPlatform, collectPerf?: boolean, inputProbe?: import('./ffprobe-log.js').MediaProbe }} [options]
 * @returns {Promise<PreparedVideo>}
 */
export async function prepareVideoForTelegram(inputPath, options = {}) {
  const platform = options.platform ?? 'instagram';
  const collectPerf = options.collectPerf === true;
  const reuseIgProbe = platform === 'instagram' && options.inputProbe;
  let probeInputMs = 0;
  let ffmpegMs = 0;
  let probeOutputMs = 0;

  let before;
  try {
    if (reuseIgProbe) {
      before = options.inputProbe;
    } else {
      const probeInputStart = Date.now();
      before = await probeMedia(inputPath);
      probeInputMs = Date.now() - probeInputStart;
    }
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
    width: before.video?.width,
    height: before.video?.height,
    video_codec: before.video?.codec_name,
    pix_fmt: before.video?.pix_fmt,
    audio_codec: before.audio?.codec_name ?? '(none)',
  });
  if (!(platform === 'instagram' && reuseIgProbe)) {
    logProbeResult(inputPath, '输入', before);
  }

  if (inputSize <= MIN_VIDEO_BYTES) {
    throw new Error(`原视频文件过小: ${inputSize} bytes`);
  }

  let shouldSkipTranscode = false;
  if (platform === 'instagram') {
    shouldSkipTranscode = canIgSkipTranscode(before, hasAudio);

    if (shouldSkipTranscode) {
      console.log('[IG] compatible detected, skip ffmpeg');
    } else {
      console.log('[IG] incompatible, start ffmpeg');
    }
  } else {
    shouldSkipTranscode = canSendWithoutTranscode(before, hasAudio);
  }

  if (shouldSkipTranscode) {
    if (platform === 'instagram') {
      // logged above
    } else {
      console.log('🚀 兼容视频，直接发送');
      console.log('[x] 直发尺寸:', {
        width: before.video?.width,
        height: before.video?.height,
      });
    }
    const skipped = { path: inputPath, sendAs: 'video' };
    if (collectPerf) {
      skipped.perf = { probeInputMs, ffmpegMs: 0, probeOutputMs: 0 };
    }
    return skipped;
  }

  if (platform !== 'instagram') {
    console.log('🔄 检测到不兼容编码，开始转码');
  }
  const scaleFilter = platform === 'instagram' ? IG_VIDEO_SCALE_FILTER : X_VIDEO_SCALE_FILTER;
  const encode = platform === 'instagram' ? IG_ENCODE : X_ENCODE;
  const outputPath = path.join(config.cacheDir, `${randomUUID()}-ios.mp4`);
  console.log(`[video] ${platform === 'instagram' ? 'IG' : 'X'} 转码, hasAudio=`, hasAudio);

  try {
    const ffmpegStart = Date.now();
    transcodeToIosMp4(inputPath, outputPath, hasAudio, scaleFilter, encode);
    await assertTranscodeOutput(outputPath);
    ffmpegMs = Date.now() - ffmpegStart;

    const probeOutputStart = Date.now();
    if (platform === 'x') {
      await assertXVideoBeforeSend(before, outputPath, hasAudio);
    } else {
      await assertIgVideoBeforeSend(before, outputPath);
    }
    probeOutputMs = Date.now() - probeOutputStart;

    scheduleCacheDeletion(outputPath);
    const prepared = { path: outputPath, sendAs: 'video' };
    if (collectPerf) {
      prepared.perf = { probeInputMs, ffmpegMs, probeOutputMs };
    }
    return prepared;
  } catch (err) {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    const reason = err instanceof Error ? err.message : String(err);

    if (platform === 'instagram') {
      if (reason === IG_ASPECT_RATIO_ERROR || reason.includes('比例异常')) {
        throw new Error(IG_ASPECT_RATIO_ERROR);
      }
      throw new Error(`IG 视频转码失败: ${reason}`);
    }

    const inputExists = fs.existsSync(inputPath);
    const inputSize = getFileSize(inputPath);
    if (inputExists && inputSize > MIN_VIDEO_BYTES) {
      console.warn('[x] 转码/验证失败，使用原文件 replyWithVideo:', reason);
      return { path: inputPath, sendAs: 'video' };
    }

    if (reason.includes('比例异常')) {
      throw new Error(reason);
    }

    throw new Error(`X 视频处理失败: ${reason}`);
  }
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {boolean} hasAudio
 */
function buildFfmpegArgs(inputPath, outputPath, hasAudio, scaleFilter, encode) {
  const args = [
    '-y',
    '-i',
    inputPath,
    '-vf',
    scaleFilter,
    '-c:v',
    'libx264',
    '-profile:v',
    encode.profile,
    '-level',
    encode.level,
    '-preset',
    encode.preset,
    '-crf',
    encode.crf,
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
function transcodeToIosMp4(inputPath, outputPath, hasAudio, scaleFilter, encode) {
  const args = buildFfmpegArgs(inputPath, outputPath, hasAudio, scaleFilter, encode);

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
