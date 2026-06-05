import { Input } from 'telegraf';
import { parseInstagramUrl } from './url.js';
import { fetchInstagramMedia } from './fetcher.js';
import { downloadToCache } from '../cache/manager.js';
import { prepareVideoForTelegram } from '../video/prepare-video.js';
import { notifyAdminCookieFailure } from '../admin/notify.js';
import { getUserFacingIgError } from '../admin/cookie-errors.js';
import { markProcessed } from '../admin/stats.js';

/**
 * @param {import('telegraf').Context} ctx
 * @param {import('telegraf').Types.Message.TextMessage} statusMsg
 * @param {string} rawMessage
 */
async function replyIgError(ctx, statusMsg, rawMessage) {
  const message = getUserFacingIgError(rawMessage);
  await notifyAdminCookieFailure(rawMessage);
  await ctx.telegram
    .editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ 处理失败：${message}`)
    .catch(() => ctx.reply(`❌ 处理失败：${message}`));
}

/**
 * @param {import('telegraf').Context} ctx
 * @param {{ filePath: string, type: 'image' | 'video' }} file
 * @returns {Promise<{ ffmpegMs: number, telegramMs: number }>}
 */
async function sendIgMedia(ctx, file) {
  let ffmpegMs = 0;
  let telegramMs = 0;

  console.log('[IG] process');

  if (file.type === 'video') {
    const ffmpegStart = Date.now();
    const prepared = await prepareVideoForTelegram(file.filePath, { platform: 'instagram' });
    ffmpegMs = Date.now() - ffmpegStart;

    console.log('[IG] send');
    const telegramStart = Date.now();
    if (prepared.sendAs === 'document') {
      await ctx.replyWithDocument(Input.fromLocalFile(prepared.path));
    } else {
      await ctx.replyWithVideo(Input.fromLocalFile(prepared.path));
    }
    telegramMs = Date.now() - telegramStart;
    return { ffmpegMs, telegramMs };
  }

  console.log('[IG] send');
  const telegramStart = Date.now();
  await ctx.replyWithPhoto(Input.fromLocalFile(file.filePath));
  telegramMs = Date.now() - telegramStart;
  return { ffmpegMs, telegramMs };
}

/**
 * @param {import('telegraf').Context} ctx
 * @param {import('telegraf').Types.Message.TextMessage} statusMsg
 * @param {string} text
 */
export async function handleInstagram(ctx, statusMsg, text) {
  const totalStart = Date.now();
  console.log('[IG] start');

  const parsed = parseInstagramUrl(text);
  if (!parsed) {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      undefined,
      '❌ 无法识别 Instagram 链接，请检查后重试。',
    );
    return;
  }

  try {
    console.log('[IG] download');
    const downloadStart = Date.now();

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

    const cachedItems = [];
    for (const item of mediaItems) {
      const cached = await downloadToCache(item.url, item.type, {
        playlistIndex: item.playlistIndex,
      });
      cachedItems.push(cached);
    }

    const downloadMs = Date.now() - downloadStart;
    console.log(`[IG PERF] download: ${downloadMs}ms`);

    let ffmpegTotalMs = 0;
    let telegramTotalMs = 0;

    for (const cached of cachedItems) {
      const { ffmpegMs, telegramMs } = await sendIgMedia(ctx, cached);
      ffmpegTotalMs += ffmpegMs;
      telegramTotalMs += telegramMs;
    }

    console.log(`[IG PERF] ffmpeg: ${ffmpegTotalMs}ms`);
    console.log(`[IG PERF] telegram: ${telegramTotalMs}ms`);
    console.log(`[IG PERF] total: ${Date.now() - totalStart}ms`);

    markProcessed();
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : '未知错误';
    await replyIgError(ctx, statusMsg, rawMessage);
  }
}
