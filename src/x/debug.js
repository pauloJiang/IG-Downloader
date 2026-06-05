import { runYtdlp, YtdlpRunError } from '../instagram/ytdlp.js';
import { redactUrl } from '../http/fetch-helper.js';
import { parseXUrl } from './url.js';

const DEBUG_STDERR_TAIL = 3000;

/**
 * @param {string} stderr
 */
function formatDebugStderr(stderr) {
  const tail = stderr.slice(-DEBUG_STDERR_TAIL);
  return tail || '(无 stderr 输出)';
}

/**
 * @param {string} text
 * @returns {Promise<{ ok: boolean, summary: string }>}
 */
export async function debugXUrl(text) {
  const parsed = parseXUrl(text);
  if (!parsed) {
    return { ok: false, summary: '❌ 不是有效的 X/Twitter status 链接' };
  }

  const urlLabel = redactUrl(parsed.url);

  try {
    const { stderr } = await runYtdlp(['-v', '--no-playlist', parsed.url], {
      platform: 'x',
      useCookies: true,
    });

    return {
      ok: true,
      summary:
        `✅ debugx 完成\nURL: ${urlLabel}\n\nstderr (last ${DEBUG_STDERR_TAIL}):\n` +
        formatDebugStderr(stderr),
    };
  } catch (err) {
    const stderr = err instanceof YtdlpRunError ? err.stderr : '';
    const fallback = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      summary:
        `❌ debugx 失败\nURL: ${urlLabel}\n\nstderr (last ${DEBUG_STDERR_TAIL}):\n` +
        formatDebugStderr(stderr || fallback),
    };
  }
}
