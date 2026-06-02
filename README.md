# Telegram Instagram Bot

通过 Telegram 下载 Instagram 帖子、Reels 和 Stories 的 Bot。

## 功能

- 识别 `instagram.com/reel/`、`instagram.com/p/`、`instagram.com/stories/` 链接
- 自动下载图片或视频并发送给用户
- 视频经 FFmpeg 转码为 iPhone/Telegram 兼容格式（H.264 baseline + AAC）后发送
- 支持轮播帖（多条媒体逐条发送）
- `/start`、`/help` 命令
- 文件缓存至 `/tmp/ig-cache`，30 分钟后自动删除
- 无需数据库

## 技术栈

- Node.js 18+
- [Telegraf](https://telegraf.js.org/)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)（解析与下载 Instagram 媒体）

## 快速开始

### 1. 获取 Bot Token

在 [@BotFather](https://t.me/BotFather) 创建 Bot，获取 `BOT_TOKEN`。

### 2. 安装 yt-dlp

```bash
pip install yt-dlp
# 或: https://github.com/yt-dlp/yt-dlp#installation
```

启动时若未检测到 yt-dlp，Bot 会尝试自动执行 `pip3 install yt-dlp`。

### 3. 本地运行

```bash
cd telegram-bot
npm install
export BOT_TOKEN=your_token_here
npm start
```

Windows PowerShell:

```powershell
cd telegram-bot
$env:BOT_TOKEN="your_token_here"   # 仅当前终端会话，不写入文件
npm start
```

### 4. Docker 部署

通过环境变量传入 Token（不要写入 `.env` 文件）：

```bash
cd telegram-bot
export BOT_TOKEN=your_token_here
docker compose up -d --build
docker compose logs -f
```

```powershell
$env:BOT_TOKEN="your_token_here"
docker compose up -d --build
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `BOT_TOKEN` | 是 | Telegram Bot Token |
| `CACHE_DIR` | 否 | 缓存目录，默认 `/tmp/ig-cache` |
| `YTDLP_BIN` | 否 | yt-dlp 可执行文件路径，默认 `yt-dlp` |

## 使用方式

1. 在 Telegram 中打开你的 Bot
2. 发送 `/start` 查看欢迎信息
3. 直接粘贴 Instagram 链接，Bot 会自动解析并发送媒体

## 限制说明

- 仅支持**公开**内容
- Stories 可能因 Instagram 限制或链接过期而失败
- Telegram Bot 单文件上传上限为 50 MB
- 依赖 yt-dlp 更新以适配 Instagram 变更

## 项目结构

```
src/
├── index.js           # 入口
├── bot.js             # Telegraf 逻辑
├── config.js          # 配置
├── cache/
│   └── manager.js     # 下载缓存与 TTL 清理
└── instagram/
    ├── url.js         # URL 识别
    ├── ytdlp.js       # yt-dlp -J 解析
    └── fetcher.js     # 导出解析接口
```
