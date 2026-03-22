# weixin-mcp

MCP server for WeChat messaging — expose WeChat capabilities as MCP tools for Claude Desktop, Cursor, and other MCP clients.

[中文](./README.md)

## Quick Start

```bash
# 1. Login (scan QR code)
npx weixin-mcp login

# 2. Check status
npx weixin-mcp status

# 3. Start MCP server (stdio mode for Claude Desktop)
npx weixin-mcp
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `npx weixin-mcp login` | QR code login |
| `npx weixin-mcp status` | Show account and daemon status |
| `npx weixin-mcp` | Start stdio MCP server (Claude Desktop) |
| `npx weixin-mcp start [--port n]` | Start HTTP daemon (background, default 3001) |
| `npx weixin-mcp stop` | Stop daemon |
| `npx weixin-mcp restart` | Restart daemon |
| `npx weixin-mcp logs [-f]` | View daemon logs (-f for follow) |
| `npx weixin-mcp send <userId> <text>` | Send message (supports short ID prefix) |
| `npx weixin-mcp poll [--watch] [--reset]` | Poll messages (--watch for continuous) |
| `npx weixin-mcp contacts` | List contacts (users who messaged the bot) |
| `npx weixin-mcp accounts [list]` | List all accounts |
| `npx weixin-mcp accounts remove <id>` | Remove an account |
| `npx weixin-mcp accounts clean` | Remove duplicates (keep newest per userId) |
| `npx weixin-mcp update` | Check and install latest version |
| `npx weixin-mcp --version` | Print version |

### Short ID Matching

When sending messages, you can use a prefix of the user ID if it uniquely matches a contact:

```bash
npx weixin-mcp send o9cq8 "hello"
# Resolved "o9cq8" → o9cq80x8ou646cs3Tt5EQgfsZRtI@im.wechat
```

## Claude Desktop Integration

Add to `claude_desktop_config.json`:

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

## HTTP Daemon Mode

Start an HTTP daemon for multi-client connections:

```bash
npx weixin-mcp start --port 3001
```

- MCP endpoint: `http://localhost:3001/mcp` (StreamableHTTP)
- Health check: `http://localhost:3001/health`

## MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `weixin_send` | Send text message | `to`, `text`, `context_token` (optional) |
| `weixin_poll` | Poll new messages | `reset_cursor` (optional) |
| `weixin_contacts` | List contacts | none |
| `weixin_get_config` | Get user config | `user_id`, `context_token` (optional) |

## Data Storage

Priority:
1. `WEIXIN_MCP_DIR` environment variable
2. `~/.openclaw/openclaw-weixin/` (if OpenClaw installed)
3. `~/.weixin-mcp/` (default)

Files:
- `accounts/<accountId>.json` — account token
- `accounts/<accountId>.cursor.json` — message cursor
- `contacts.json` — contact book
- `daemon.json` — daemon PID (HTTP mode only)
- `daemon.log` — daemon logs

## Environment Variables

| Variable | Description |
|----------|-------------|
| `WEIXIN_MCP_DIR` | Custom data directory |
| `WEIXIN_ACCOUNT_ID` | Specify which account to use |

## License

MIT
