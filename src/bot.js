import { Telegraf } from 'telegraf';
import { config } from './config.js';
import { getBotCommand, isAllowed } from './admin/auth.js';
import { registerAdminCommands } from './admin/commands.js';
import { setNotifyBot } from './admin/notify.js';
import { detectPlatform, hasSupportedPlatformLink } from './platforms/detect.js';
import { handleInstagram } from './instagram/handler.js';
import { handleX } from './x/handler.js';

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
    if (!hasSupportedPlatformLink(text)) return;

    const platformInfo = detectPlatform(text);
    if (!platformInfo) return;

    const statusMsg = await ctx.reply('⏳ 正在解析并下载，请稍候…');

    if (platformInfo.platform === 'instagram') {
      await handleInstagram(ctx, statusMsg, platformInfo.text);
      return;
    }

    await handleX(ctx, statusMsg, platformInfo.text);
  });

  return bot;
}
