import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { scheduleCacheDeletion } from '../cache/manager.js';
import { probeMedia, logProbeResult } from './ffprobe-log.js';

const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {{ video: { codec_name?: string } | null, audio: { codec_name?: string } | null }} probe
 */
function needsTranscode(probe) {
  if (probe.video?.codec_name !== 'h264') return true;
  if (probe.audio && probe.audio.codec_name !== 'aac') return true;
  return false;
}

/**
 * @param {string} outputPath
 */
async function assertTranscodeOutput(outputPath) {
  await sleep(1000);

  if (!fs.existsSync(outputPath)) {
    throw new Error('转码输出文件不存在');
  }

  if (fs.statSync(outputPath).size === 0) {
    throw new Error('转码输出文件为空');
  }
}

/**
 * @param {string} outputPath
 */
function logOutputProbeOptional(outputPath) {
  try {
    const probe = execFileSync(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_streams', outputPath],
      { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
    );
    console.log('[ffprobe] output:', probe);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(
      'ffprobe failed, but video file exists, continue sending:',
      message,
    );
  }
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

  const hasAudio = Boolean(before.audio);
  console.log('[video] 输入检测:', {
    file: path.basename(inputPath),
    codec_name: before.video?.codec_name ?? 'none',
    hasAudio,
    audio_codec: before.audio?.codec_name ?? 'none',
  });
  logProbeResult(inputPath, '发送前', before);

  if (!needsTranscode(before)) {
    console.log('[video] 已是 h264 + aac（或无音轨），直接发送');
    return inputPath;
  }

  const outputPath = path.join(config.cacheDir, `${randomUUID()}-h264.mp4`);
  console.log('[video] 开始转码, hasAudio=', hasAudio);

  transcodeToH264(inputPath, outputPath, hasAudio);

  await assertTranscodeOutput(outputPath);
  logOutputProbeOptional(outputPath);

  scheduleCacheDeletion(outputPath);
  return outputPath;
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
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
  ];

  if (hasAudio) {
    args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2');
  } else {
    args.push('-an');
  }

  args.push('-movflags', '+faststart', outputPath);
  return args;
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {boolean} hasAudio
 */
function transcodeToH264(inputPath, outputPath, hasAudio) {
  const args = buildFfmpegArgs(inputPath, outputPath, hasAudio);

  console.log('[ffmpeg] 命令:', FFMPEG_BIN, args.join(' '));

  const result = spawnSync(FFMPEG_BIN, args, {
    encoding: 'utf8',
    maxBuffer: 100 * 1024 * 1024,
  });

  if (result.error?.code === 'ENOENT') {
    throw new Error('未找到 ffmpeg');
  }

  const exists = fs.existsSync(outputPath);
  const size = exists ? fs.statSync(outputPath).size : 0;

  if (!exists) {
    if (result.status !== 0) {
      console.error('FFMPEG_FULL_ERROR:', result.stderr);
      throw new Error((result.stderr || `FFmpeg 退出码 ${result.status}`).slice(-1000));
    }
    throw new Error('输出文件不存在');
  }

  if (size === 0) {
    throw new Error('输出文件为空');
  }

  if (result.status !== 0) {
    console.log('[ffmpeg] 退出码', result.status, '但输出文件有效，视为成功');
  }

  console.log('[ffmpeg] 转码完成, exit=', result.status, 'size=', size);
}
