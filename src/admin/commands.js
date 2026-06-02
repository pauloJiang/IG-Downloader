import fs from 'node:fs/promises';
import { config } from '../config.js';
import { isAdmin } from './auth.js';
import { addUser, removeUser, listUsers } from './whitelist.js';
import { saveCookieFile, isValidCookieContent } from './cookie-file.js';
import { getBotStatus, clearCacheFiles } from './stats.js';

/** @type {Set<number>} */
export const awaitingCookieUpload = new Set();

/**
 * @param {import('telegraf').Context} ctx
 */
export function registerAdminCommands(bot) {
  bot.command('myid', async (ctx) => {
    const id = ctx.from?.id;
    await ctx.reply(`你的 Telegram 数字ID：${id ?? '未知'}`);
  });

  bot.command('allow', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ 仅管理员可用');
      return;
    }

    const targetId = parseUserIdFromCommand(ctx.message.text);
    if (!targetId) {
      await ctx.reply('用法：/allow 用户ID');
      return;
    }

    await addUser(targetId);
    await ctx.reply('✅ 用户已加入白名单');
  });

  bot.command('remove', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ 仅管理员可用');
      return;
    }

    const targetId = parseUserIdFromCommand(ctx.message.text);
    if (!targetId) {
      await ctx.reply('用法：/remove 用户ID');
      return;
    }

    try {
      await removeUser(targetId);
      await ctx.reply('✅ 用户已移除白名单');
    } catch (err) {
      const message = err instanceof Error ? err.message : '操作失败';
      await ctx.reply(`❌ ${message}`);
    }
  });

  bot.command('listusers', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ 仅管理员可用');
      return;
    }

    const users = listUsers();
    if (!users.length) {
      await ctx.reply('白名单为空');
      return;
    }

    await ctx.reply(`白名单用户（${users.length}）：\n${users.join('\n')}`);
  });

  bot.command('uploadcookie', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ 仅管理员可用');
      return;
    }

    const adminId = ctx.from.id;
    awaitingCookieUpload.add(adminId);
    await ctx.reply('请发送新的 cookies.txt 文件');
  });

  bot.command('status', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ 仅管理员可用');
      return;
    }

    const s = await getBotStatus();
    await ctx.reply(
      '🤖 Bot状态\n' +
        `Cookie文件：${s.cookieExists ? '存在' : '不存在'}\n` +
        `Cookie大小：${s.cookieSizeKb} KB\n` +
        `白名单人数：${s.whitelistCount}\n` +
        `缓存文件数量：${s.cacheCount}\n` +
        `最近处理时间：${s.lastProcessed}\n` +
        '运行状态：正常',
    );
  });

  bot.command('clearcache', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply('❌ 仅管理员可用');
      return;
    }

    const deleted = await clearCacheFiles();
    await ctx.reply(`✅ 缓存已清理，共删除 ${deleted} 个文件`);
  });

  bot.on('document', async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !awaitingCookieUpload.has(userId) || !isAdmin(userId)) {
      return next();
    }

    awaitingCookieUpload.delete(userId);

    const doc = ctx.message.document;
    const fileName = doc.file_name || '';

    if (!fileName.toLowerCase().includes('cookie') && !fileName.endsWith('.txt')) {
      await ctx.reply('❌ Cookie文件无效');
      return;
    }

    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await fetch(fileLink.href);
      const content = await response.text();

      if (!isValidCookieContent(content)) {
        await ctx.reply('❌ Cookie文件无效');
        return;
      }

      await saveCookieFile(content);
      await ctx.reply('✅ Cookie更新成功');
    } catch (err) {
      console.error('[uploadcookie] 失败:', err);
      await ctx.reply('❌ Cookie文件无效');
    }
  });
}

/**
 * @param {string | undefined} text
 */
function parseUserIdFromCommand(text) {
  if (!text) return null;
  const parts = text.trim().split(/\s+/);
  const id = Number(parts[1]);
  return Number.isFinite(id) ? id : null;
}
