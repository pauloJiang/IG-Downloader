import { redactUrl } from '../http/fetch-helper.js';
import { downloadToCache } from '../cache/manager.js';

export const X_DOWNLOAD_ERROR =
  'X 视频下载失败，可能是私密内容、登录限制或链接无效。';

/**
 * @param {string} url
 * @returns {Promise<{ filePath: string, type: 'video' }>}
 */
export async function downloadXVideo(url) {
  console.log('[x] 下载视频:', redactUrl(url));
  return downloadToCache(url, 'video', { platform: 'x' });
}
