import { runYtdlp, YtdlpRunError } from '../instagram/ytdlp.js';
import { redactUrl } from '../http/fetch-helper.js';
import { parseXUrl } from './url.js';

/**
 * @param {string} text
 * @returns {Promise<{ ok: boolean, summary: string }>}
 */
export async function debugXUrl(text) {
  const parsed = parseXUrl(text);
  if (!parsed) {
    return { ok: false, summary: '❌ 不是有效的 X/Twitter status 链接' };
  }

  try {
    const { stdout } = await runYtdlp(
      ['--dump-json', '--no-playlist', '--no-warnings', parsed.url],
      { platform: 'x', useCookies: false },
    );

    const data = JSON.parse(stdout);
    const videoFormats = (data.formats || []).filter(
      (f) => f.vcodec && f.vcodec !== 'none',
    );

    return {
      ok: true,
      summary:
        '✅ debugx 解析成功\n' +
        `URL: ${redactUrl(parsed.url)}\n` +
        `标题: ${data.title || '(无)'}\n` +
        `时长: ${data.duration ?? '(无)'}s\n` +
        `视频格式数: ${videoFormats.length}\n` +
        `extractor: ${data.extractor || '(无)'}\n` +
        `id: ${data.id || '(无)'}`,
    };
  } catch (err) {
    const stderr = err instanceof YtdlpRunError ? err.stderr : '';
    const tail = stderr.slice(-1500) || (err instanceof Error ? err.message : String(err));
    return {
      ok: false,
      summary: `❌ debugx 失败\n\nstderr (last 1500):\n${tail}`,
    };
  }
}
