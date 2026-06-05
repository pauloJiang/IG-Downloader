import { parseInstagramUrl, containsInstagramUrl } from '../instagram/url.js';
import { parseXUrl, containsXUrl } from '../x/url.js';

/**
 * @typedef {{ platform: 'instagram', url: string, type: 'reel' | 'post' | 'story', shortcode?: string, username?: string, storyId?: string }}
 *   | {{ platform: 'x', url: string }}
 *   SupportedLink
 */

/**
 * @param {string} text
 * @returns {SupportedLink | null}
 */
export function parseSupportedLink(text) {
  const ig = parseInstagramUrl(text);
  if (ig) {
    return { platform: 'instagram', ...ig };
  }

  const x = parseXUrl(text);
  if (x) {
    return { platform: 'x', url: x.url };
  }

  return null;
}

/**
 * @param {string} text
 */
export function containsSupportedLink(text) {
  return containsInstagramUrl(text) || containsXUrl(text);
}
