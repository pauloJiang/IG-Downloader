const IG_HOST = /(?:https?:\/\/)?(?:www\.)?instagram\.com/i;

const PATTERNS = {
  reel: /instagram\.com\/reel\/([A-Za-z0-9_-]+)/i,
  post: /instagram\.com\/p\/([A-Za-z0-9_-]+)/i,
  story: /instagram\.com\/stories\/([A-Za-z0-9_.]+)\/(\d+)/i,
};

/**
 * @param {string} text
 * @returns {{ type: 'reel' | 'post' | 'story', shortcode?: string, username?: string, storyId?: string, url: string } | null}
 */
export function parseInstagramUrl(text) {
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;

  const url = match[0].replace(/[)>]+$/g, '');

  if (!IG_HOST.test(url)) return null;

  for (const [type, pattern] of Object.entries(PATTERNS)) {
    const m = url.match(pattern);
    if (!m) continue;

    if (type === 'story') {
      return {
        type: 'story',
        username: m[1],
        storyId: m[2],
        url,
      };
    }

    return {
      type,
      shortcode: m[1],
      url,
    };
  }

  return null;
}

export function containsInstagramUrl(text) {
  return parseInstagramUrl(text) !== null;
}
