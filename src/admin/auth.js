import { config } from '../config.js';
import { isWhitelisted } from './whitelist.js';

/**
 * @param {import('telegraf').Context} ctx
 * @returns {string | null}
 */
export function getBotCommand(ctx) {
  const text = ctx.message?.text;
  if (!text) return null;

  const entities = ctx.message?.entities;
  if (entities?.length) {
    const cmdEntity = entities.find((e) => e.type === 'bot_command');
    if (cmdEntity) {
      return text
        .slice(cmdEntity.offset, cmdEntity.offset + cmdEntity.length)
        .split('@')[0]
        .toLowerCase();
    }
  }

  if (text.startsWith('/')) {
    return text.split(/\s+/)[0].split('@')[0].toLowerCase();
  }

  return null;
}

/**
 * @param {number | undefined} userId
 */
export function isAdmin(userId) {
  if (!userId || !config.adminTgId) return false;
  return userId === config.adminTgId;
}

/**
 * @param {number | undefined} userId
 */
export function isAllowed(userId) {
  if (!userId) return false;
  return isWhitelisted(userId);
}
