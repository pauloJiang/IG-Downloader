import { Telegraf, Input } from 'telegraf';
import { config } from './config.js';
import { fetchInstagramMedia } from './instagram/fetcher.js';
import { downloadToCache } from './cache/manager.js';
import { prepareVideoForTelegram } from './video/prepare-video.js';
import { getBotCommand, isAllowed } from './admin/auth.js';
import { registerAdminCommands } from './admin/commands.js';
import { setNotifyBot, notifyAdminCookieFailure } from './admin/notify.js';
import { getUserFacingIgError } from './admin/cookie-errors.js';
import { markProcessed } from './admin/stats.js';
import { parseSupportedLink, containsSupportedLink } from './platforms/link.js';
import { downloadXVideo } from './x/download.js';
import { X_USER_ERROR_MESSAGE } from './x/errors.js';

const HELP_TEXT = `📖 *使用帮助*

发送 Instagram 或 X/Twitter 链接，Bot 会自动识别并下载媒体：

• \`instagram.com/reel/\` — Reels 短视频
• \`instagram.com/p/\` — 帖子（图片/视频/轮播）
• \`instagram.com/stories/\` — Stories 快拍
• \`x.com/.../status/\` — X 视频
• \`twitter.com/.../status/\` — Twitter 视频

支持直接发送链接，或包含链接的消息文本。

*命令：*
/start — 欢迎信息
/help — 显示此帮助
/myid — 查看你的 Telegram 数字ID

*说明：*
• 使用 yt-dlp 解析与下载
• 非 H.264 视频会自动转码后再发送
• 轮播帖会逐条发送所有媒体
• 下载文件缓存 30 分钟后自动删除`;

/**
 * @param {import('telegraf').Context} ctx
 * @param {{ filePath: string, type: 'image' | 'video' }} file
 */
async function sendMediaFile(ctx, file) {
  if (file.type === 'video') {
    const prepared = await prepareVideoForTelegram(file.filePath);

    if (prepared.sendAs === 'document') {
      await ctx.replyWithDocument(Input.fromLocalFile(prepared.path));
      return;
    }

    await ctx.replyWithVideo(Input.fromLocalFile(prepared.path));
  } else {
    await ctx.replyWithPhoto(Input.fromLocalFile(file.filePath));
  }
}

/**
 * @param {import('telegraf').Context} ctx
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
 * @param {import('telegraf').Types.Message.TextMessage} statusMsg
 */
async function handleXDownloadError(ctx, statusMsg) {
  await ctx.telegram
    .editMessageText(ctx.chat.id, statusMsg.message_id, undefined, X_USER_ERROR_MESSAGE)
    .catch(() => ctx.reply(X_USER_ERROR_MESSAGE));
}

/**
 * @param {import('telegraf').Context} ctx
 * @param {import('telegraf').Types.Message.TextMessage} statusMsg
 * @param {{ url: string }} link
 */
async function handleInstagramDownload(ctx, statusMsg, link) {
  const mediaItems = await fetchInstagramMedia(link.url);

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
}

/**
 * @param {import('telegraf').Context} ctx
 * @param {import('telegraf').Types.Message.TextMessage} statusMsg
 * @param {{ url: string }} link
 */
async function handleXDownload(ctx, statusMsg, link) {
  const cached = await downloadXVideo(link.url);
  await sendMediaFile(ctx, cached);
  markProcessed();
  await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
}

/**
 * @returns {import('telegraf').Telegraf}
 */
export function createBot() {
  const bot = new Telegraf(config.botToken);
  setNotifyBot(bot);

  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const command = getBotCommand(ctx);
    if (command === '/myid') {
      await ctx.reply(`你的 Telegram 数字ID：${userId}`);
      return;
    }

    if (!isAllowed(userId)) {
      await ctx.reply('❌ 私人机器人，暂无使用权限');
      return;
    }

    return next();
  });

  registerAdminCommands(bot);

  bot.start(async (ctx) => {
    await ctx.reply(
      '👋 欢迎使用 Instagram / X 下载 Bot！\n\n' +
        '直接发送 Instagram 或 X/Twitter 链接，我会把图片或视频发给你。\n\n' +
        '输入 /help 查看详细说明。',
      { parse_mode: 'Markdown' },
    );
  });

  bot.help(async (ctx) => {
    await ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' });
  });

  bot.on('text', async (ctx) => {
    const text = ctx.message.text;

    if (text.startsWith('/')) return;

    if (!containsSupportedLink(text)) return;

    const link = parseSupportedLink(text);
    if (!link) {
      await ctx.reply('❌ 无法识别链接，请检查后重试。');
      return;
    }

    const statusMsg = await ctx.reply('⏳ 正在解析并下载，请稍候…');

    try {
      if (link.platform === 'instagram') {
        await handleInstagramDownload(ctx, statusMsg, link);
        return;
      }

      await handleXDownload(ctx, statusMsg, link);
    } catch (err) {
      if (link.platform === 'x') {
        await handleXDownloadError(ctx, statusMsg);
        return;
      }

      const rawMessage = err instanceof Error ? err.message : '未知错误';
      await handleIgDownloadError(ctx, statusMsg, rawMessage);
    }
  });

  return bot;
}
