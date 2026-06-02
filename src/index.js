import { config } from './config.js';
import { initCacheDir } from './cache/manager.js';
import { createBot } from './bot.js';

async function main() {
  if (!config.botToken) {
    console.error('错误：请设置环境变量 BOT_TOKEN');
    process.exit(1);
  }

  await initCacheDir();

  const bot = createBot();

  bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    ctx.reply('❌ 发生内部错误，请稍后重试。').catch(() => {});
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
