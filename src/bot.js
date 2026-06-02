import { Telegraf, Input } from 'telegraf';
import { config } from './config.js';
import { parseInstagramUrl, containsInstagramUrl } from './instagram/url.js';
import { fetchInstagramMedia } from './instagram/fetcher.js';
import { downloadToCache } from './cache/manager.js';

const HELP_TEXT = `📖 *使用帮助*

发送 Instagram 链接，Bot 会自动识别并下载媒体：

• \`instagram.com/reel/\` — Reels 短视频
• \`instagram.com/p/\` — 帖子（图片/视频/轮播）
• \`instagram.com/stories/\` — Stories 快拍

支持直接发送链接，或包含链接的消息文本。

*命令：*
/start — 欢迎信息
/help — 显示此帮助

*说明：*
• 使用 yt-dlp 解析与下载
• 轮播帖会逐条发送所有媒体
• 下载文件缓存 30 分钟后自动删除`;

/**
 * @param {import('telegraf').Context} ctx
 * @param {{ filePath: string, type: 'image' | 'video' }} file
 */
async function sendMediaFile(ctx, file) {
  if (file.type === 'video') {
    await ctx.replyWithVideo(Input.fromLocalFile(file.filePath));
  } else {
    await ctx.replyWithPhoto(Input.fromLocalFile(file.filePath));
  }
}

/**
 * @returns {import('telegraf').Telegraf}
 */
export function createBot() {
  const bot = new Telegraf(config.botToken);

  bot.start(async (ctx) => {
    await ctx.reply(
      '👋 欢迎使用 Instagram 下载 Bot！\n\n' +
        '直接发送 Instagram 链接（帖子 / Reels / Stories），我会把图片或视频发给你。\n\n' +
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

    if (!containsInstagramUrl(text)) return;

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
        const cached = await downloadToCache(item.url, item.type);
        await sendMediaFile(ctx, cached);
      }

      await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      await ctx.telegram
        .editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ 处理失败：${message}`)
        .catch(() => ctx.reply(`❌ 处理失败：${message}`));
    }
  });

  return bot;
}
