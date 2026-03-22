# weixin-mcp

Standalone MCP server for WeChat — expose WeChat messaging as MCP tools for Claude Desktop and other MCP clients.

Reuses the token from [OpenClaw weixin plugin](https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin) if already installed, or supports independent QR login.

## Quick Start

### Step 1 — Login (first time only)

```bash
npx weixin-login
```

A QR code will appear in your terminal. Scan it with WeChat and confirm. Token is saved locally.

### Step 2 — Start the MCP server

```bash
npx weixin-mcp
```

## Claude Desktop Integration

Add to your `claude_desktop_config.json`:

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

Restart Claude Desktop. You can now ask Claude to send WeChat messages or poll for new ones.

## Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `weixin_send` | Send a text message | `to` (user ID), `text`, `context_token` (optional — link reply to a conversation) |
| `weixin_poll` | Poll for new messages (cursor-based, no duplicates) | `reset_cursor` (optional boolean) |
| `weixin_get_config` | Get user config (typing ticket, etc.) | `user_id`, `context_token` (optional) |

## Already using OpenClaw weixin plugin?

If you've already logged in via OpenClaw, no login needed — `npx weixin-mcp` will pick up the existing token automatically.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAW_STATE_DIR` | `~/.openclaw` | State directory; accounts are read from `$OPENCLAW_STATE_DIR/openclaw-weixin/accounts/` |
| `WEIXIN_ACCOUNT_ID` | first account found | Specify which account to use (filename without `.json`) |

## Re-login

If your token expires:

```bash
npx weixin-login
```

## License

MIT
