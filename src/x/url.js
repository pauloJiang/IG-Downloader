const X_HOST = /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)/i;
const STATUS_PATTERN = /(?:x\.com|twitter\.com)\/[^/\s]+\/status\/(\d+)/i;

/**
 * @param {string} text
 * @returns {{ url: string } | null}
 */
export function parseXUrl(text) {
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;

  const url = match[0].replace(/[)>]+$/g, '');

  if (!X_HOST.test(url) || !STATUS_PATTERN.test(url)) {
    return null;
  }

  return { url };
}

/**
 * @param {string} text
 */
export function containsXUrl(text) {
  return parseXUrl(text) !== null;
}
