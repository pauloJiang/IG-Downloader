const PREVIEW_LEN = 300;

export const HTML_RESPONSE_ERROR =
  '解析失败，Instagram 返回了网页/验证页，可能需要更换解析方式';

/**
 * @param {string} url
 */
export function redactUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

/**
 * @param {string} text
 * @param {number} [maxLen]
 */
export function redactPreview(text, maxLen = PREVIEW_LEN) {
  const slice = text.slice(0, maxLen);
  return slice
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[url]')
    .replace(/\b\d{8,}:[A-Za-z0-9_-]{20,}\b/g, '[token]');
}

/**
 * @param {string} contentType
 */
export function isJsonContentType(contentType) {
  return /application\/json|application\/javascript|text\/javascript/i.test(contentType);
}

/**
 * @param {string} contentType
 * @param {string} text
 */
export function isHtmlContent(contentType, text) {
  if (/text\/html/i.test(contentType)) return true;
  const trimmed = text.trimStart().slice(0, 20).toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

/**
 * @param {string} requestUrl
 * @param {Response} response
 * @param {string} bodyText
 */
export function logFetchResponse(requestUrl, response, bodyText) {
  const contentType = response.headers.get('content-type') || '(none)';
  console.log('[fetch]', {
    url: redactUrl(requestUrl),
    status: response.status,
    contentType,
    preview: redactPreview(bodyText),
  });
}

/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<{ response: Response, text: string, contentType: string }>}
 */
export async function fetchWithText(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  logFetchResponse(url, response, text);
  return { response, text, contentType };
}

/**
 * @param {string} url
 * @param {RequestInit} options
 * @param {{ expectJson?: boolean, allowHtml?: boolean }} [opts]
 * @returns {Promise<object>}
 */
export async function fetchJson(url, options = {}, opts = {}) {
  const { expectJson = true, allowHtml = false } = opts;
  const { response, text, contentType } = await fetchWithText(url, options);

  if (!response.ok) {
    throw new Error(`请求失败 (${response.status})`);
  }

  const html = isHtmlContent(contentType, text);
  const jsonType = isJsonContentType(contentType);

  if (html && !allowHtml) {
    const err = new Error(HTML_RESPONSE_ERROR);
    err.code = 'HTML_RESPONSE';
    throw err;
  }

  if (expectJson && !jsonType && !text.trimStart().startsWith('{') && !text.trimStart().startsWith('[')) {
    if (html) {
      const err = new Error(HTML_RESPONSE_ERROR);
      err.code = 'HTML_RESPONSE';
      throw err;
    }
    throw new Error(`响应不是 JSON（content-type: ${contentType || 'unknown'}）`);
  }

  try {
    return JSON.parse(text);
  } catch {
    if (html) {
      const err = new Error(HTML_RESPONSE_ERROR);
      err.code = 'HTML_RESPONSE';
      throw err;
    }
    throw new Error('响应 JSON 解析失败');
  }
}

/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<string>}
 */
export async function fetchHtml(url, options = {}) {
  const { response, text, contentType } = await fetchWithText(url, options);

  if (!response.ok) {
    throw new Error(`页面请求失败 (${response.status})`);
  }

  if (isHtmlContent(contentType, text)) {
    return text;
  }

  if (isJsonContentType(contentType)) {
    const err = new Error(HTML_RESPONSE_ERROR);
    err.code = 'HTML_RESPONSE';
    throw err;
  }

  return text;
}

/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Buffer>}
 */
export async function fetchBinary(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());

  const headText = buffer.toString('utf8', 0, Math.min(buffer.length, PREVIEW_LEN));
  const preview = isHtmlContent(contentType, headText)
    ? redactPreview(headText)
    : `[binary, ${buffer.length} bytes, type=${contentType || 'unknown'}]`;

  logFetchResponse(url, response, preview);

  if (!response.ok) {
    throw new Error(`媒体下载失败 (${response.status})`);
  }

  if (isHtmlContent(contentType, headText)) {
    throw new Error('媒体下载失败：服务器返回了网页而非文件');
  }

  if (isJsonContentType(contentType)) {
    throw new Error('媒体下载失败：服务器返回了 JSON 而非文件');
  }

  return buffer;
}
