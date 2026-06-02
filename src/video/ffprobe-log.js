import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * @typedef {{ codec_name?: string, pix_fmt?: string, width?: number, height?: number }} VideoStreamInfo
 * @typedef {{ codec_name?: string }} AudioStreamInfo
 */

/**
 * @param {string} filePath
 * @returns {Promise<{ stdout: string, video: VideoStreamInfo | null, audio: AudioStreamInfo | null }>}
 */
export async function probeMedia(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_streams',
    filePath,
  ]);

  const data = JSON.parse(stdout);
  const videoStream = (data.streams || []).find((s) => s.codec_type === 'video');
  const audioStream = (data.streams || []).find((s) => s.codec_type === 'audio');

  const video = videoStream
    ? {
        codec_name: videoStream.codec_name,
        pix_fmt: videoStream.pix_fmt,
        width: videoStream.width,
        height: videoStream.height,
      }
    : null;

  const audio = audioStream
    ? {
        codec_name: audioStream.codec_name,
      }
    : null;

  return { stdout, video, audio };
}

/** @deprecated 使用 probeMedia */
export const probeVideo = probeMedia;

/**
 * @param {string} filePath
 * @param {string} label
 * @param {{ stdout: string, video: VideoStreamInfo | null, audio: AudioStreamInfo | null }} probe
 */
export function logProbeResult(filePath, label, probe) {
  console.log(`[ffprobe] ${label} 输出:`, probe.stdout);

  const streams = JSON.parse(probe.stdout).streams || [];
  for (const stream of streams) {
    if (stream.codec_type !== 'video' && stream.codec_type !== 'audio') continue;

    console.log(`[ffprobe] ${label} stream:`, {
      file: path.basename(filePath),
      codec_type: stream.codec_type,
      codec_name: stream.codec_name,
      pix_fmt: stream.pix_fmt,
      width: stream.width,
      height: stream.height,
    });
  }

  if (!streams.some((s) => s.codec_type === 'video')) {
    console.log(`[ffprobe] ${label}: 未找到视频流`, path.basename(filePath));
  }
}

/**
 * @param {string} filePath
 */
export async function logVideoProbe(filePath) {
  try {
    const probe = await probeMedia(filePath);
    logProbeResult(filePath, '发送前', probe);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log('[ffprobe] 探测失败:', path.basename(filePath), message);
  }
}
