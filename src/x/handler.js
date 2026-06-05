import { Input } from 'telegraf';
import { parseXUrl } from './url.js';
import { downloadXVideo } from './download.js';
import { XDownloadError } from './ytdlp.js';
import { markProcessed } from '../admin/stats.js';

const X_USER_ERROR = '❌ X 下载失败，可能需要登录、链接无效或视频受限。';

/**
 * @param {unknown} err
 */
function logXYtdlpStderr(err) {
  const stderr = err instanceof XDownloadError ? err.stderr : '';
  if (stderr) {
    console.error('[X] yt-dlp stderr (last 1500):', stderr.slice(-1500));
  }
}

/**
 * @param {import('telegraf').Context} ctx
 * @param {string} text
 */
export async function handleX(ctx, text) {
  console.log('[X] received');

  const parsed = parseXUrl(text);
  if (!parsed) {
    await ctx.reply('❌ 无法识别 X/Twitter 链接，请检查后重试。');
    return;
  }

  try {
    console.log('[X] download start');
    const { filePath } = await downloadXVideo(parsed.url);
    console.log('[X] download success');

    console.log('[X] send start');
    await ctx.replyWithVideo(Input.fromLocalFile(filePath));
    console.log('[X] send success');

    markProcessed();
  } catch (err) {
    logXYtdlpStderr(err);
    console.error('[X] download failed:', err);
    await ctx.reply(X_USER_ERROR);
  }
}
