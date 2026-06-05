import { config } from './config.js';
import { initCacheDir } from './cache/manager.js';
import { createBot } from './bot.js';
import { ensureYtdlp } from './instagram/ytdlp.js';
import { initIgCookies } from './instagram/cookies.js';
import { initXCookies, logXCookiesStartup } from './x/cookies.js';
import { initWhitelist } from './admin/whitelist.js';

async function main() {
  if (!config.botToken) {
    console.error('错误：请通过环境变量 BOT_TOKEN 传入 Token（不要写入本地文件）');
    process.exit(1);
  }

  if (!config.adminTgId) {
    console.warn('警告：未设置 ADMIN_TG_ID，管理功能不可用');
  }

  await ensureYtdlp();
  await initIgCookies();
  await initXCookies();
  logXCookiesStartup();
  await initWhitelist();
  await initCacheDir();

  const bot = createBot();

  bot.catch((err, ctx) => {
    console.error('[IG ERROR]', err);
    if (err instanceof Error && err.stack) {
      console.error('[IG ERROR] stack:', err.stack);
    }
    ctx.reply('❌ 处理失败，请稍后重试').catch(() => {});
  });

  console.log('Telegram IG Bot 启动中…');
  await bot.launch();
  console.log('Bot 已运行');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
