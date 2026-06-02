import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * @param {string} filePath
 */
export async function logVideoProbe(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_streams',
      filePath,
    ]);

    console.log('[ffprobe] 输出:', stdout);

    const data = JSON.parse(stdout);
    for (const stream of data.streams || []) {
      if (stream.codec_type !== 'video') continue;

      console.log('[ffprobe] 视频流:', {
        file: path.basename(filePath),
        codec_name: stream.codec_name,
        pix_fmt: stream.pix_fmt,
        width: stream.width,
        height: stream.height,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log('[ffprobe] 探测失败:', path.basename(filePath), message);
  }
}
