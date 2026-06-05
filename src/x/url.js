const X_HOST =
  /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com|mobile\.twitter\.com)/i;
const STATUS_PATH = /\/status\/(\d+)/i;

/**
 * @param {string} text
 * @returns {string | null}
 */
export function extractXUrl(text) {
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;

  const url = match[0].replace(/[)>]+$/g, '');
  if (!X_HOST.test(url)) return null;
  if (!STATUS_PATH.test(url)) return null;

  return url;
}

/**
 * @param {string} text
 */
export function containsXUrl(text) {
  return extractXUrl(text) !== null;
}

/**
 * @param {string} text
 * @returns {{ url: string } | null}
 */
export function parseXUrl(text) {
  const url = extractXUrl(text);
  if (!url) return null;
  return { url };
}

/**
 * @param {string} url
 */
export function isXUrl(url) {
  const lower = url.toLowerCase();
  return lower.includes('x.com') || lower.includes('twitter.com');
}
