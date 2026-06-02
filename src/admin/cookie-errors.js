const IG_USER_ERROR = '❌ Instagram 需要登录或当前 IP 被限制，请稍后再试。';

const COOKIE_ERROR_KEYWORDS = [
  'login required',
  'rate-limit reached',
  'rate limit',
  'requested content is not available',
  'cookies',
  'account credentials',
];

/**
 * @param {string} message
 */
export function isCookieRelatedError(message) {
  const lower = message.toLowerCase();
  return COOKIE_ERROR_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * @param {string} message
 */
export function getUserFacingIgError(message) {
  if (isCookieRelatedError(message)) {
    return IG_USER_ERROR;
  }
  return message;
}
