# Telegram Instagram Bot

通过 Telegram 下载 Instagram 帖子、Reels 和 Stories 的 Bot。

## 功能

- 识别 `instagram.com/reel/`、`instagram.com/p/`、`instagram.com/stories/` 链接
- 使用 yt-dlp 自动下载图片或视频并发送给用户
- 支持 `IG_COOKIES` 访问需登录内容
- 支持轮播帖（多条媒体逐条发送）
- `/start`、`/help` 命令
- 文件缓存至 `/tmp/ig-cache`，30 分钟后自动删除
- 无需数据库

## 技术栈

- Node.js 18+
- [Telegraf](https://telegraf.js.org/)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)

## 快速开始

### 1. 获取 Bot Token

在 [@BotFather](https://t.me/BotFather) 创建 Bot，获取 `BOT_TOKEN`。

### 2. 本地运行

需已安装 `yt-dlp`（Docker 镜像会自动安装）。

```bash
cd telegram-bot
npm install
export BOT_TOKEN=your_token_here
export IG_COOKIES="$(cat cookies.txt)"   # 可选
npm start
```

Windows PowerShell:

```powershell
cd telegram-bot
$env:BOT_TOKEN="your_token_here"
$env:IG_COOKIES=Get-Content cookies.txt -Raw   # 可选
npm start
```

### 3. Docker / Railway 部署

```bash
export BOT_TOKEN=your_token_here
export IG_COOKIES="$(cat cookies.txt)"   # 可选
docker compose up -d --build
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `BOT_TOKEN` | 是 | Telegram Bot Token |
| `IG_COOKIES` | 否 | Instagram cookies 全文（Netscape 或 JSON），启动时写入 `/tmp/ig-cookies.txt` |
| `CACHE_DIR` | 否 | 缓存目录，默认 `/tmp/ig-cache` |
| `YTDLP_BIN` | 否 | yt-dlp 可执行文件路径，默认 `yt-dlp` |

## Cookies 说明

1. 用浏览器扩展导出 Instagram cookies（Netscape `.txt` 或 JSON）
2. 将**完整内容**设为环境变量 `IG_COOKIES`（不要提交到 Git）
3. Bot 启动时写入 `/tmp/ig-cookies.txt`，所有 yt-dlp 调用自动附加 `--cookies /tmp/ig-cookies.txt`

若出现 `login required` 或 `rate-limit reached`，Bot 会提示更新 cookies 或稍后再试。

## 限制说明

- 私密内容通常需要有效的 `IG_COOKIES`
- Telegram Bot 单文件上传上限为 50 MB
- 依赖 yt-dlp 更新以适配 Instagram 变更

## 项目结构

```
src/
├── index.js
├── bot.js
├── config.js
├── cache/manager.js
└── instagram/
    ├── url.js
    ├── cookies.js
    ├── ytdlp.js
    └── fetcher.js
```
