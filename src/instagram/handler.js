import { Input } from 'telegraf';
import { parseInstagramUrl } from './url.js';
import { fetchInstagramMedia } from './fetcher.js';
import { downloadToCache } from '../cache/manager.js';
import { prepareIgVideoForTelegram } from './prepare-video.js';
import { notifyAdminCookieFailure } from '../admin/notify.js';
import { getUserFacingIgError } from '../admin/cookie-errors.js';
import { markProcessed } from '../admin/stats.js';

/**
 * @param {import('telegraf').Context} ctx
 * @param {{ filePath: string, type: 'image' | 'video' }} file
 */
async function sendMediaFile(ctx, file) {
  if (file.type === 'video') {
    const prepared = await prepareIgVideoForTelegram(file.filePath);

    if (prepared.sendAs === 'document') {
      await ctx.replyWithDocument(Input.fromLocalFile(prepared.path));
      return;
    }

    await ctx.replyWithVideo(Input.fromLocalFile(prepared.path));
    return;
  }

  await ctx.replyWithPhoto(Input.fromLocalFile(file.filePath));
}

/**
 * @param {import('telegraf').Context} ctx
 * @param {import('telegraf').Types.Message.TextMessage} statusMsg
 * @param {string} rawMessage
 */
async function handleIgDownloadError(ctx, statusMsg, rawMessage) {
  const message = getUserFacingIgError(rawMessage);
  await notifyAdminCookieFailure(rawMessage);
  await ctx.telegram
    .editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ 处理失败：${message}`)
    .catch(() => ctx.reply(`❌ 处理失败：${message}`));
}

/**
 * @param {import('telegraf').Context} ctx
 * @param {string} text
 */
export async function handleInstagram(ctx, text) {
  const parsed = parseInstagramUrl(text);
  if (!parsed) {
    await ctx.reply('❌ 无法识别 Instagram 链接，请检查后重试。');
    return;
  }

  const statusMsg = await ctx.reply('⏳ 正在解析并下载，请稍候…');

  try {
    const mediaItems = await fetchInstagramMedia(parsed.url);

    if (!mediaItems.length) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        undefined,
        '❌ 未找到可下载的媒体。',
      );
      return;
    }

    for (const item of mediaItems) {
      const cached = await downloadToCache(item.url, item.type, {
        playlistIndex: item.playlistIndex,
      });
      await sendMediaFile(ctx, cached);
    }

    markProcessed();
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
  } catch (err) {
    console.error('[IG ERROR]', err);
    if (err instanceof Error && err.stack) {
      console.error('[IG ERROR] stack:', err.stack);
    }
    const rawMessage = err instanceof Error ? err.message : '未知错误';
    await handleIgDownloadError(ctx, statusMsg, rawMessage);
  }
}
