import { config } from '../config.js';
import { isCookieRelatedError } from './cookie-errors.js';

/** @type {import('telegraf').Telegraf | null} */
let botInstance = null;

/**
 * @param {import('telegraf').Telegraf} bot
 */
export function setNotifyBot(bot) {
  botInstance = bot;
}

/**
 * @param {string} error
 */
export async function notifyAdminCookieFailure(error) {
  if (!config.adminTgId || !botInstance || !isCookieRelatedError(error)) {
    return;
  }

  const text =
    '⚠️ Cookie可能已失效\n\n' +
    `错误：\n${error.slice(0, 2000)}\n\n` +
    '建议：\n发送 /uploadcookie 更新 cookies.txt';

  try {
    await botInstance.telegram.sendMessage(config.adminTgId, text);
  } catch (err) {
    console.error('[notify] 无法通知管理员:', err);
  }
}
