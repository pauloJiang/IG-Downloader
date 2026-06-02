import { config } from '../config.js';
import { isWhitelisted } from './whitelist.js';

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
