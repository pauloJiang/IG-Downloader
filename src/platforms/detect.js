/**
 * @param {string} text
 * @returns {{ platform: 'instagram', url: string, text: string } | { platform: 'x', url: string, text: string } | null}
 */
export function detectPlatform(text) {
  const match = text.match(/https?:\/\/[^\s]+/i);
  if (!match) return null;

  const url = match[0].replace(/[)>]+$/g, '');
  const lower = url.toLowerCase();

  if (lower.includes('instagram.com')) {
    return { platform: 'instagram', url, text };
  }

  if (
    lower.includes('x.com') ||
    lower.includes('twitter.com') ||
    lower.includes('mobile.twitter.com')
  ) {
    return { platform: 'x', url, text };
  }

  return null;
}

/**
 * @param {string} text
 */
export function hasSupportedPlatformLink(text) {
  return detectPlatform(text) !== null;
}
