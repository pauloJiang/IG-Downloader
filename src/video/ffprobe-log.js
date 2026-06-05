import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * @typedef {{
 *   codec_name?: string,
 *   profile?: string,
 *   pix_fmt?: string,
 *   width?: number,
 *   height?: number,
 * }} VideoStreamInfo
 * @typedef {{ codec_name?: string }} AudioStreamInfo
 * @typedef {{
 *   stdout: string,
 *   video: VideoStreamInfo | null,
 *   audio: AudioStreamInfo | null,
 *   format_name?: string,
 * }} MediaProbe
 */

/**
 * @param {string} filePath
 * @returns {Promise<MediaProbe>}
 */
export async function probeMedia(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    filePath,
  ]);

  const data = JSON.parse(stdout);
  const videoStream = (data.streams || []).find((s) => s.codec_type === 'video');
  const audioStream = (data.streams || []).find((s) => s.codec_type === 'audio');

  const video = videoStream
    ? {
        codec_name: videoStream.codec_name,
        profile: videoStream.profile,
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

  return {
    stdout,
    video,
    audio,
    format_name: data.format?.format_name,
  };
}

/** @deprecated 使用 probeMedia */
export const probeVideo = probeMedia;

/**
 * @param {string | undefined} profile
 */
function isBaselineProfile(profile) {
  if (!profile) return false;
  const p = profile.toLowerCase();
  return p.includes('baseline');
}

/**
 * @param {string | undefined} formatName
 */
function isMp4Container(formatName) {
  if (!formatName) return false;
  const f = formatName.toLowerCase();
  return f.includes('mp4') || f.includes('mov');
}

/**
 * @param {MediaProbe} probe
 * @param {boolean} requireAudio
 */
export function validateIosMp4(probe, requireAudio) {
  if (!probe.video) {
    throw new Error('无视频流');
  }

  if (probe.video.codec_name !== 'h264') {
    throw new Error(`video codec=${probe.video.codec_name ?? 'none'}，需要 h264`);
  }

  if (!isBaselineProfile(probe.video.profile)) {
    throw new Error(`profile=${probe.video.profile ?? 'none'}，需要 Baseline`);
  }

  if (probe.video.pix_fmt !== 'yuv420p') {
    throw new Error(`pix_fmt=${probe.video.pix_fmt ?? 'none'}，需要 yuv420p`);
  }

  if (requireAudio) {
    if (!probe.audio || probe.audio.codec_name !== 'aac') {
      throw new Error(`audio codec=${probe.audio?.codec_name ?? 'none'}，需要 aac`);
    }
  }

  if (!isMp4Container(probe.format_name)) {
    throw new Error(`container=${probe.format_name ?? 'none'}，需要 mp4`);
  }
}

/**
 * @param {MediaProbe} probe
 * @param {boolean} requireAudio
 */
export function isIosMp4Compatible(probe, requireAudio) {
  try {
    validateIosMp4(probe, requireAudio);
    return true;
  } catch {
    return false;
  }
}

/**
 * 满足 h264 + yuv420p + aac（或无音频）时跳过转码直发（X 分支）。
 * @param {MediaProbe} probe
 * @param {boolean} hasAudio
 */
export function canSendWithoutTranscode(probe, hasAudio) {
  if (!probe.video) return false;
  if (probe.video.codec_name !== 'h264') return false;
  if (probe.video.pix_fmt !== 'yuv420p') return false;
  if (hasAudio) {
    if (!probe.audio || probe.audio.codec_name !== 'aac') return false;
  }
  return true;
}

/**
 * @param {string} filePath
 * @param {string} label
 * @param {MediaProbe} probe
 */
export function logProbeResult(filePath, label, probe) {
  console.log(`[ffprobe] ${label} 输出:`, probe.stdout);

  console.log(`[ffprobe] ${label} 摘要:`, {
    file: path.basename(filePath),
    format: probe.format_name,
    video_codec: probe.video?.codec_name,
    video_profile: probe.video?.profile,
    width: probe.video?.width,
    height: probe.video?.height,
    pix_fmt: probe.video?.pix_fmt,
    audio_codec: probe.audio?.codec_name ?? '(none)',
  });

  const streams = JSON.parse(probe.stdout).streams || [];
  for (const stream of streams) {
    if (stream.codec_type !== 'video' && stream.codec_type !== 'audio') continue;

    console.log(`[ffprobe] ${label} stream:`, {
      codec_type: stream.codec_type,
      codec_name: stream.codec_name,
      profile: stream.profile,
      pix_fmt: stream.pix_fmt,
    });
  }
}

/**
 * @param {string} filePath
 */
export async function logDownloadStreams(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'quiet',
      '-show_streams',
      filePath,
    ]);
    console.log('[ffprobe] 下载后 -show_streams:', path.basename(filePath));
    console.log(stdout);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log('[ffprobe] 下载后探测失败:', path.basename(filePath), message);
  }
}

/**
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
export async function hasAudioStream(filePath) {
  const probe = await probeMedia(filePath);
  return Boolean(probe.audio);
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
