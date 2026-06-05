import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { config } from '../config.js';

/** @type {Set<number>} */
let whitelist = new Set();

/**
 * @returns {Promise<void>}
 */
export async function initWhitelist() {
  await fs.mkdir(config.dataDir, { recursive: true });

  if (!existsSync(config.whitelistPath)) {
    await saveWhitelist(new Set());
  }

  await loadWhitelist();

  if (config.adminTgId) {
    whitelist.add(config.adminTgId);
    await saveWhitelist(whitelist);
    console.log('[whitelist] 管理员已加入白名单:', config.adminTgId);
  }

  console.log('[whitelist] 当前人数:', whitelist.size);
  console.log(`[IG] Whitelist: loaded in memory (${whitelist.size} users)`);
}

/**
 * @returns {Promise<void>}
 */
async function loadWhitelist() {
  const raw = await fs.readFile(config.whitelistPath, 'utf8');
  const data = JSON.parse(raw);
  whitelist = new Set((data.users || []).map(Number).filter(Boolean));
}

/**
 * @param {Set<number>} users
 */
async function saveWhitelist(users) {
  const list = [...users].sort((a, b) => a - b);
  await fs.writeFile(
    config.whitelistPath,
    `${JSON.stringify({ users: list }, null, 2)}\n`,
    'utf8',
  );
  whitelist = new Set(list);
}

/**
 * @param {number} userId
 */
export function isWhitelisted(userId) {
  if (config.adminTgId && userId === config.adminTgId) {
    return true;
  }
  return whitelist.has(userId);
}

/**
 * @param {number} userId
 */
export async function addUser(userId) {
  whitelist.add(userId);
  await saveWhitelist(whitelist);
}

/**
 * @param {number} userId
 */
export async function removeUser(userId) {
  if (config.adminTgId && userId === config.adminTgId) {
    throw new Error('不能移除管理员');
  }
  whitelist.delete(userId);
  await saveWhitelist(whitelist);
}

/**
 * @returns {number[]}
 */
export function listUsers() {
  return [...whitelist].sort((a, b) => a - b);
}
