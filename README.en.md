# weixin-mcp

[![npm version](https://img.shields.io/npm/v/weixin-mcp.svg)](https://www.npmjs.com/package/weixin-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

🤖 **WeChat MCP Server** — Let AI assistants send and receive WeChat messages

> ⚠️ **Important**: This project uses the official WeChat **ClawBot** (AI agent bot) API. You need to create a ClawBot in WeChat and scan to login. **This does NOT use your personal WeChat account** — it uses the official bot interface.
>
> 👉 Create ClawBot: WeChat → Discover → Mini Programs → Search "ClawBot"

Expose WeChat ClawBot capabilities as [MCP](https://modelcontextprotocol.io/) tools. Claude Desktop, Cursor, OpenClaw, and other AI assistants can directly:

- 📨 **Send messages** — text, images, files, videos
- 📬 **Receive messages** — polling or real-time Webhook push
- 👥 **Manage contacts** — auto-track conversation users

[中文](./README.md) | [ClawHub Skill](https://clawhub.com/skills/weixin-mcp)

---

## ✨ Features

- **Official API** — uses WeChat ClawBot API, compliant and secure
- **Zero config** — create ClawBot, scan QR, done
- **All message types** — text / image / file / video
- **Real-time push** — Webhook mode for instant delivery
- **Multi-account** — run multiple instances in different directories
- **MCP standard** — compatible with all MCP clients

---

## 🚀 Quick Start

```bash
# 1. QR code login
npx weixin-mcp login

# 2. Check status
npx weixin-mcp status

# 3. Send a test message
npx weixin-mcp send <userId> "Hello from CLI!"

# 4. Start MCP server
npx weixin-mcp
```

---

## 🔌 Claude Desktop Integration

Edit `claude_desktop_config.json`:

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

Restart Claude Desktop. Now Claude can send and receive WeChat messages for you!

---

## 🛠️ CLI Commands

| Command | Description |
|---------|-------------|
| `login` | QR code login |
| `status` | Show account and daemon status |
| `send <to> <text>` | Send message (supports short ID) |
| `poll [--watch]` | Poll messages |
| `contacts` | List contacts |
| `start [--webhook url]` | Start HTTP daemon |
| `stop` / `restart` | Stop/restart daemon |
| `logs [-f]` | View logs |
| `accounts list\|clean\|remove` | Manage accounts |
| `update` | Update to latest version |

### Short ID Matching

Use a prefix instead of full ID when unique:

```bash
npx weixin-mcp send abc12 "hello"
# ✓ Resolved "abc12" → abc123xyz456@im.wechat
```

### Send Images/Files/Videos

```bash
# Send image
npx weixin-mcp send abc12 --image /path/to/photo.jpg

# Send file
npx weixin-mcp send abc12 --file /path/to/document.pdf

# Send video
npx weixin-mcp send abc12 --video /path/to/video.mp4

# With caption
npx weixin-mcp send abc12 --image /path/to/photo.jpg --caption "Check this out"
```

---

## 🔧 MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `weixin_send` | Send text | `to`, `text`, `context_token?` |
| `weixin_send_image` | Send image | `to`, `source`, `caption?` |
| `weixin_send_file` | Send file | `to`, `source`, `caption?` |
| `weixin_poll` | Poll messages | `reset_cursor?` |
| `weixin_contacts` | List contacts | - |
| `weixin_get_config` | Get config | `user_id` |

---

## 📡 Webhook Mode

Receive messages in real-time:

```bash
npx weixin-mcp start --webhook http://your-server/weixin-hook
```

Messages are POSTed to your webhook:

```json
{
  "event": "weixin_messages",
  "messages": [{
    "from_user_id": "...",
    "item_list": [{"type": 1, "text_item": {"text": "Hello"}}],
    "context_token": "..."
  }],
  "timestamp": "2026-03-22T19:00:00.000Z"
}
```

---

## 🏠 Data Storage

Priority: `$WEIXIN_MCP_DIR` > `~/.openclaw/openclaw-weixin/` > `~/.weixin-mcp/`

| File | Description |
|------|-------------|
| `accounts/*.json` | Login credentials |
| `contacts.json` | Contact book |
| `daemon.json` | Daemon state |
| `daemon.log` | Logs |

---

## 🔀 Multi-Instance Mode

One bot = one WeChat account. For multiple accounts, run instances in different directories:

```bash
# Instance A (port 3001)
WEIXIN_MCP_DIR=~/.weixin-mcp-a npx weixin-mcp login
WEIXIN_MCP_DIR=~/.weixin-mcp-a npx weixin-mcp start --port 3001

# Instance B (port 3002)
WEIXIN_MCP_DIR=~/.weixin-mcp-b npx weixin-mcp login
WEIXIN_MCP_DIR=~/.weixin-mcp-b npx weixin-mcp start --port 3002
```

Claude Desktop multi-account config:

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

## 🔗 Related Projects

- [OpenClaw](https://github.com/anthropics/openclaw) — AI Agent Infrastructure
- [MCP Protocol](https://modelcontextprotocol.io/) — Model Context Protocol
- [ClawHub](https://clawhub.com/) — Agent Skills Marketplace

---

## 📄 License

MIT © [bkmashiro](https://github.com/bkmashiro)
