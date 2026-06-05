export const X_USER_ERROR_MESSAGE = `❌ X 视频下载失败

可能原因：
1. 该推文没有视频
2. 视频需要登录
3. 内容被地区限制
4. 链接不是 status 链接
5. X 限制当前服务器 IP`;

export const X_AUTH_ERROR_MESSAGE = `❌ X 需要登录验证

请管理员重新上传 X Cookie：

/uploadxcookie`;

/**
 * @param {string} text
 */
export function isXAuthError(text) {
  const lower = text.toLowerCase();
  return (
    lower.includes('bad guest token') ||
    lower.includes('requires authentication') ||
    lower.includes('login required')
  );
}
