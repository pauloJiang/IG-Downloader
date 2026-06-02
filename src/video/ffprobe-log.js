import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * @typedef {{ codec_name?: string, pix_fmt?: string, width?: number, height?: number }} VideoStreamInfo
 */

/**
 * @param {string} filePath
 * @returns {Promise<{ stdout: string, video: VideoStreamInfo | null }>}
 */
export async function probeVideo(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_streams',
    filePath,
  ]);

  const data = JSON.parse(stdout);
  const stream = (data.streams || []).find((s) => s.codec_type === 'video');

  const video = stream
    ? {
        codec_name: stream.codec_name,
        pix_fmt: stream.pix_fmt,
        width: stream.width,
        height: stream.height,
      }
    : null;

  return { stdout, video };
}

/**
 * @param {string} filePath
 * @param {string} label
 * @param {{ stdout: string, video: VideoStreamInfo | null }} probe
 */
export function logProbeResult(filePath, label, probe) {
  console.log(`[ffprobe] ${label} 输出:`, probe.stdout);

  if (probe.video) {
    console.log(`[ffprobe] ${label} 视频流:`, {
      file: path.basename(filePath),
      codec_name: probe.video.codec_name,
      pix_fmt: probe.video.pix_fmt,
      width: probe.video.width,
      height: probe.video.height,
    });
  } else {
    console.log(`[ffprobe] ${label}: 未找到视频流`, path.basename(filePath));
  }
}

/**
 * @param {string} filePath
 */
export async function logVideoProbe(filePath) {
  try {
    const probe = await probeVideo(filePath);
    logProbeResult(filePath, '发送前', probe);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log('[ffprobe] 探测失败:', path.basename(filePath), message);
  }
}
