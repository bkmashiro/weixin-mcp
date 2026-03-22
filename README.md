# weixin-mcp

[![npm version](https://img.shields.io/npm/v/weixin-mcp.svg)](https://www.npmjs.com/package/weixin-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

🤖 **微信 MCP Server** — 让 AI 助手直接收发微信消息

> ⚠️ **重要说明**：本项目基于微信官方 **ClawBot**（智能体机器人）API，需要在微信中创建 ClawBot 后扫码登录。**不是用个人微信账号发消息**，而是通过官方机器人接口。
>
> 👉 创建 ClawBot：微信 → 发现 → 小程序 → 搜索「ClawBot」

将微信 ClawBot 能力暴露为 [MCP](https://modelcontextprotocol.io/) 工具，Claude Desktop、Cursor、OpenClaw 等 AI 助手可以直接：

- 📨 **发送消息** — 文本、图片、文件、视频
- 📬 **接收消息** — 轮询或 Webhook 实时推送
- 👥 **管理联系人** — 自动记录对话用户

[English](./README.en.md) | [ClawHub Skill](https://clawhub.com/skills/weixin-mcp)

---

## ✨ 特性

- **官方接口** — 基于微信 ClawBot API，合规安全
- **零配置** — 创建 ClawBot 后扫码即用，无需公众号/企业微信
- **全类型消息** — 文本 / 图片 / 文件 / 视频
- **实时推送** — Webhook 模式，消息秒级推送到你的服务
- **多账号支持** — 不同目录运行多个实例
- **MCP 标准** — 兼容所有 MCP 客户端

---

## 🚀 快速开始

```bash
# 1. 扫码登录
npx weixin-mcp login

# 2. 查看状态
npx weixin-mcp status

# 3. 发消息测试
npx weixin-mcp send <userId> "Hello from CLI!"

# 4. 启动 MCP server
npx weixin-mcp
```

---

## 🔌 Claude Desktop 集成

编辑 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "weixin": {
      "command": "npx",
      "args": ["weixin-mcp"]
    }
  }
}
```

重启 Claude Desktop，即可让 Claude 帮你收发微信消息！

---

## 🛠️ CLI 命令

| 命令 | 说明 |
|------|------|
| `login` | 扫码登录微信 |
| `status` | 查看账号和 daemon 状态 |
| `send <to> <text>` | 发送消息（支持短 ID） |
| `poll [--watch]` | 拉取消息 |
| `contacts` | 查看联系人 |
| `start [--webhook url]` | 启动 HTTP daemon |
| `stop` / `restart` | 停止/重启 daemon |
| `logs [-f]` | 查看日志 |
| `accounts list\|clean\|remove` | 管理账号 |
| `update` | 更新到最新版 |

### 短 ID 匹配

联系人唯一时，可用前缀代替完整 ID：

```bash
npx weixin-mcp send abc12 "hello"
# ✓ Resolved "abc12" → abc123xyz456@im.wechat
```

### 发送图片/文件/视频

```bash
# 发送图片
npx weixin-mcp send abc12 --image /path/to/photo.jpg

# 发送文件
npx weixin-mcp send abc12 --file /path/to/document.pdf

# 发送视频
npx weixin-mcp send abc12 --video /path/to/video.mp4

# 带文字说明
npx weixin-mcp send abc12 --image /path/to/photo.jpg --caption "看看这张图"
```

---

## 🔧 MCP 工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `weixin_send` | 发送文本 | `to`, `text`, `context_token?` |
| `weixin_send_image` | 发送图片 | `to`, `source`, `caption?` |
| `weixin_send_file` | 发送文件 | `to`, `source`, `caption?` |
| `weixin_poll` | 拉取消息 | `reset_cursor?` |
| `weixin_contacts` | 联系人列表 | - |
| `weixin_get_config` | 获取配置 | `user_id` |

---

## 📡 Webhook 模式

实时接收消息推送：

```bash
npx weixin-mcp start --webhook http://your-server/weixin-hook
```

收到消息时 POST 到 webhook：

```json
{
  "event": "weixin_messages",
  "messages": [{
    "from_user_id": "...",
    "item_list": [{"type": 1, "text_item": {"text": "你好"}}],
    "context_token": "..."
  }],
  "timestamp": "2026-03-22T19:00:00.000Z"
}
```

---

## 🏠 数据存储

优先级：`$WEIXIN_MCP_DIR` > `~/.openclaw/openclaw-weixin/` > `~/.weixin-mcp/`

| 文件 | 说明 |
|------|------|
| `accounts/*.json` | 登录凭证 |
| `contacts.json` | 联系人 |
| `daemon.json` | Daemon 状态 |
| `daemon.log` | 日志 |

---

## 🔀 多实例模式

一个 bot = 一个微信账号。需要多账号时，用不同目录运行多个实例：

```bash
# 实例 A（端口 3001）
WEIXIN_MCP_DIR=~/.weixin-mcp-a npx weixin-mcp login
WEIXIN_MCP_DIR=~/.weixin-mcp-a npx weixin-mcp start --port 3001

# 实例 B（端口 3002）
WEIXIN_MCP_DIR=~/.weixin-mcp-b npx weixin-mcp login
WEIXIN_MCP_DIR=~/.weixin-mcp-b npx weixin-mcp start --port 3002
```

Claude Desktop 配置多账号：

```json
{
  "mcpServers": {
    "weixin-personal": {
      "command": "npx",
      "args": ["weixin-mcp", "start", "--port", "3001"],
      "env": { "WEIXIN_MCP_DIR": "/Users/you/.weixin-mcp-personal" }
    },
    "weixin-work": {
      "command": "npx",
      "args": ["weixin-mcp", "start", "--port", "3002"],
      "env": { "WEIXIN_MCP_DIR": "/Users/you/.weixin-mcp-work" }
    }
  }
}
```

---

## 🔗 相关项目

- [OpenClaw](https://github.com/anthropics/openclaw) — AI Agent 基础设施
- [MCP Protocol](https://modelcontextprotocol.io/) — Model Context Protocol
- [ClawHub](https://clawhub.com/) — Agent Skills 市场

---

## 📄 License

MIT © [bkmashiro](https://github.com/bkmashiro)
