import { spawn } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { scheduleCacheDeletion } from '../cache/manager.js';
import { probeMedia, logProbeResult } from './ffprobe-log.js';

const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';

const FFMPEG_ERROR_KEYWORDS = [
  'Error',
  'Invalid',
  'failed',
  'Conversion',
  'encoder',
  'Output',
  'Stream',
];

/**
 * @param {{ video: { codec_name?: string } | null, audio: { codec_name?: string } | null }} probe
 */
function needsTranscode(probe) {
  if (probe.video?.codec_name !== 'h264') return true;
  if (probe.audio && probe.audio.codec_name !== 'aac') return true;
  return false;
}

/**
 * @param {string} stderr
 * @returns {string}
 */
export function extractFfmpegErrorHint(stderr) {
  const lines = stderr.split(/\r?\n/);
  const hints = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hit = FFMPEG_ERROR_KEYWORDS.some((kw) =>
      line.toLowerCase().includes(kw.toLowerCase()),
    );
    if (!hit) continue;

    for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 1); j++) {
      const ctx = lines[j].trim();
      if (!ctx || seen.has(ctx)) continue;
      seen.add(ctx);
      hints.push(ctx);
    }
  }

  if (hints.length) {
    return hints.join('\n').slice(0, 1500);
  }

  const trimmed = stderr.trim();
  return trimmed.slice(0, 1500) || 'ffmpeg 转码失败';
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

  await transcodeToH264(inputPath, outputPath, hasAudio);

  const after = await probeMedia(outputPath);
  logProbeResult(outputPath, 'output', after);

  if (after.video?.codec_name !== 'h264') {
    throw new Error(
      `转码后视频验证失败: codec_name=${after.video?.codec_name ?? 'none'}`,
    );
  }

  if (hasAudio) {
    if (after.audio?.codec_name !== 'aac') {
      throw new Error(
        `转码后音频验证失败: codec_name=${after.audio?.codec_name ?? 'none'}`,
      );
    }
    console.log('[video] 验证通过: video=h264, audio=aac');
  } else {
    console.log('[video] 验证通过: video=h264（无音频轨）');
  }

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
        console.log('[ffmpeg] stderr 完整输出:\n', stderr);
        reject(new Error(`视频转码失败:\n${extractFfmpegErrorHint(stderr)}`));
        return;
      }
      console.log('[ffmpeg] 转码完成');
      resolve();
    });
  });
}
