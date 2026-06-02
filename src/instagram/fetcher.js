const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const IG_APP_ID = '936619743392459';
const GRAPHQL_DOC_ID = '10015901848480474';

/**
 * @typedef {{ type: 'image' | 'video', url: string }} MediaItem
 */

/**
 * @param {string} shortcode
 * @returns {Promise<MediaItem[]>}
 */
async function fetchShortcodeMedia(shortcode) {
  const body = new URLSearchParams({
    variables: JSON.stringify({ shortcode }),
    doc_id: GRAPHQL_DOC_ID,
  });

  const response = await fetch('https://www.instagram.com/api/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-IG-App-ID': IG_APP_ID,
      'User-Agent': USER_AGENT,
      'Accept': '*/*',
      'Origin': 'https://www.instagram.com',
      'Referer': `https://www.instagram.com/p/${shortcode}/`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Instagram GraphQL 请求失败 (${response.status})`);
  }

  const json = await response.json();
  const media = json?.data?.xdt_shortcode_media;

  if (!media) {
    return fetchShortcodeMediaFromHtml(shortcode);
  }

  return extractMediaFromNode(media);
}

/**
 * @param {object} node
 * @returns {MediaItem[]}
 */
function extractMediaFromNode(node) {
  const sidecar = node?.edge_sidecar_to_children?.edges;
  if (sidecar?.length) {
    return sidecar.map(({ node: child }) => ({
      type: child.is_video ? 'video' : 'image',
      url: child.is_video ? child.video_url : child.display_url,
    }));
  }

  if (node.is_video && node.video_url) {
    return [{ type: 'video', url: node.video_url }];
  }

  if (node.display_url) {
    return [{ type: 'image', url: node.display_url }];
  }

  throw new Error('未找到可下载的媒体');
}

/**
 * @param {string} shortcode
 * @returns {Promise<MediaItem[]>}
 */
async function fetchShortcodeMediaFromHtml(shortcode) {
  const pageUrl = `https://www.instagram.com/p/${shortcode}/`;
  const html = await fetchHtml(pageUrl);

  const sharedData = extractSharedData(html);
  if (sharedData) {
    const media = sharedData?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media;
    if (media) return extractMediaFromNode(media);
  }

  const ogVideo = html.match(/property="og:video(?::url)?"\s+content="([^"]+)"/i);
  if (ogVideo) {
    return [{ type: 'video', url: decodeHtmlEntities(ogVideo[1]) }];
  }

  const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/i);
  if (ogImage) {
    return [{ type: 'image', url: decodeHtmlEntities(ogImage[1]) }];
  }

  throw new Error('无法解析 Instagram 帖子内容');
}

/**
 * @param {string} username
 * @param {string} storyId
 * @returns {Promise<MediaItem[]>}
 */
async function fetchStoryMedia(username, storyId) {
  const pageUrl = `https://www.instagram.com/stories/${username}/${storyId}/`;
  const html = await fetchHtml(pageUrl);

  const videoMatch =
    html.match(/"video_url":"([^"]+)"/) ||
    html.match(/property="og:video(?::url)?"\s+content="([^"]+)"/i);

  if (videoMatch) {
    return [{ type: 'video', url: decodeJsonUrl(videoMatch[1]) }];
  }

  const imageMatch =
    html.match(/"display_url":"([^"]+)"/) ||
    html.match(/property="og:image"\s+content="([^"]+)"/i);

  if (imageMatch) {
    return [{ type: 'image', url: decodeJsonUrl(imageMatch[1]) }];
  }

  throw new Error('无法解析 Instagram Story（可能需要登录或链接已过期）');
}

/**
 * @param {{ type: 'reel' | 'post' | 'story', shortcode?: string, username?: string, storyId?: string }} parsed
 * @returns {Promise<MediaItem[]>}
 */
export async function fetchInstagramMedia(parsed) {
  if (parsed.type === 'story') {
    return fetchStoryMedia(parsed.username, parsed.storyId);
  }

  return fetchShortcodeMedia(parsed.shortcode);
}

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Instagram 页面请求失败 (${response.status})`);
  }

  return response.text();
}

/**
 * @param {string} html
 * @returns {object | null}
 */
function extractSharedData(html) {
  const match = html.match(/window\._sharedData\s*=\s*(\{.+?\});/s);
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * @param {string} value
 * @returns {string}
 */
function decodeJsonUrl(value) {
  return decodeHtmlEntities(value.replace(/\\u0026/g, '&').replace(/\\\//g, '/'));
}

/**
 * @param {string} value
 * @returns {string}
 */
function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}
