import fs from 'node:fs';
import { Input } from 'telegraf';
import { parseXUrl } from './url.js';
import { downloadXVideo } from './download.js';
import { prepareVideoForTelegram } from '../video/prepare-video.js';
import { markProcessed } from '../admin/stats.js';
import { X_USER_ERROR_MESSAGE, X_AUTH_ERROR_MESSAGE, isXAuthError } from './errors.js';
import { YtdlpRunError } from './ytdlp.js';

/**
 * @param {import('telegraf').Context} ctx
 * @param {import('telegraf').Types.Message.TextMessage} statusMsg
 * @param {unknown} err
 */
async function replyXError(ctx, statusMsg, err) {
  const stderr = err instanceof YtdlpRunError ? err.stderr : '';
  const message = err instanceof Error ? err.message : String(err);
  const text = isXAuthError(`${stderr}\n${message}`)
    ? X_AUTH_ERROR_MESSAGE
    : X_USER_ERROR_MESSAGE;

  await ctx.telegram
    .editMessageText(ctx.chat.id, statusMsg.message_id, undefined, text)
    .catch(() => ctx.reply(text));
}

/**
 * @param {import('telegraf').Context} ctx
 * @param {{ filePath: string, type: 'video' }} file
 */
async function sendXMedia(ctx, file) {
  console.log('[X] process');
  const prepared = await prepareVideoForTelegram(file.filePath, { platform: 'x' });

  console.log('[X] send');
  console.log('[X] sendingPath:', prepared.path);
  const fileExists = fs.existsSync(prepared.path);
  const fileSize = fileExists ? fs.statSync(prepared.path).size : 0;

  await ctx.replyWithVideo(Input.fromLocalFile(prepared.path));

  console.log('[X] 已发送视频:', {
    path: prepared.path,
    fileExists,
    fileSize,
  });
}

/**
 * @param {import('telegraf').Context} ctx
 * @param {import('telegraf').Types.Message.TextMessage} statusMsg
 * @param {string} text
 */
export async function handleX(ctx, statusMsg, text) {
  console.log('[X] start');

  const parsed = parseXUrl(text);
  if (!parsed) {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      undefined,
      '❌ 无法识别 X/Twitter 链接，请检查后重试。',
    );
    return;
  }

  try {
    console.log('[X] download');
    const cached = await downloadXVideo(parsed.url);
    await sendXMedia(ctx, cached);

    markProcessed();
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
  } catch (err) {
    await replyXError(ctx, statusMsg, err);
  }
}
