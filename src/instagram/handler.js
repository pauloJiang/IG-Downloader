import { Input } from 'telegraf';
import { parseInstagramUrl } from './url.js';
import { fetchInstagramMedia } from './fetcher.js';
import { downloadToCache } from '../cache/manager.js';
import { prepareVideoForTelegram } from '../video/prepare-video.js';
import { notifyAdminCookieFailure } from '../admin/notify.js';
import { getUserFacingIgError } from '../admin/cookie-errors.js';
import { markProcessed } from '../admin/stats.js';
import { createIgPerfTotals, logIgPerfSummary } from './perf.js';

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
 * @param {ReturnType<typeof createIgPerfTotals>} perf
 */
async function sendIgMedia(ctx, file, perf) {
  console.log('[IG] process');

  if (file.type === 'video') {
    const prepared = await prepareVideoForTelegram(file.filePath, {
      platform: 'instagram',
      collectPerf: true,
    });

    if (prepared.perf) {
      perf.probeInputMs += prepared.perf.probeInputMs;
      perf.ffmpegMs += prepared.perf.ffmpegMs;
      perf.probeOutputMs += prepared.perf.probeOutputMs;
    }

    console.log('[IG] send');
    const telegramStart = Date.now();
    if (prepared.sendAs === 'document') {
      await ctx.replyWithDocument(Input.fromLocalFile(prepared.path));
    } else {
      await ctx.replyWithVideo(Input.fromLocalFile(prepared.path));
    }
    perf.telegramMs += Date.now() - telegramStart;
    return;
  }

  console.log('[IG] send');
  const telegramStart = Date.now();
  await ctx.replyWithPhoto(Input.fromLocalFile(file.filePath));
  perf.telegramMs += Date.now() - telegramStart;
}

/**
 * @param {import('telegraf').Context} ctx
 * @param {string} text
 */
export async function handleInstagram(ctx, text) {
  const totalStart = Date.now();
  const perf = createIgPerfTotals();
  console.log('[IG PERF] start');

  const detectStart = Date.now();
  const parsed = parseInstagramUrl(text);
  perf.detectMs = Date.now() - detectStart;

  if (!parsed) {
    const statusMsg = await ctx.reply('❌ 无法识别 Instagram 链接，请检查后重试。');
    perf.replyMs = 0;
    logIgPerfSummary(perf, Date.now() - totalStart);
    return;
  }

  const replyStart = Date.now();
  const statusMsg = await ctx.reply('🔍 正在解析下载...');
  perf.replyMs = Date.now() - replyStart;

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
      perf.downloadMs = Date.now() - downloadStart;
      logIgPerfSummary(perf, Date.now() - totalStart);
      return;
    }

    const cachedItems = [];
    for (const item of mediaItems) {
      const cached = await downloadToCache(item.url, item.type, {
        playlistIndex: item.playlistIndex,
      });
      cachedItems.push(cached);
    }

    perf.downloadMs = Date.now() - downloadStart;

    for (const cached of cachedItems) {
      await sendIgMedia(ctx, cached, perf);
    }

    logIgPerfSummary(perf, Date.now() - totalStart);

    markProcessed();
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
  } catch (err) {
    logIgPerfSummary(perf, Date.now() - totalStart);
    const rawMessage = err instanceof Error ? err.message : '未知错误';
    await replyIgError(ctx, statusMsg, rawMessage);
  }
}
