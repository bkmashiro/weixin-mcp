# weixin-mcp

基于 MCP 协议的微信消息服务端——将微信能力暴露为 MCP 工具，供 Claude Desktop、Cursor 及其他 MCP 客户端使用。

支持复用 [OpenClaw weixin 插件](https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin) 的已有登录态，或独立扫码登录。

[English](./README.en.md)

## 快速开始

```bash
# 1. 登录（首次使用，扫码）
npx weixin-mcp login

# 2. 查看状态
npx weixin-mcp status

# 3. 启动 MCP server（Claude Desktop 模式）
npx weixin-mcp
```

## CLI 命令一览

| 命令 | 说明 |
|------|------|
| `npx weixin-mcp login` | 扫码登录微信 |
| `npx weixin-mcp status` | 查看账号和 daemon 状态 |
| `npx weixin-mcp` | 启动 stdio MCP server（Claude Desktop） |
| `npx weixin-mcp start [--port n]` | 启动 HTTP daemon（后台，默认端口 3001） |
| `npx weixin-mcp stop` | 停止 daemon |
| `npx weixin-mcp restart` | 重启 daemon |
| `npx weixin-mcp logs [-f]` | 查看 daemon 日志（-f 实时跟踪） |
| `npx weixin-mcp send <userId> <text>` | 发送消息（支持短 ID 前缀匹配） |
| `npx weixin-mcp poll [--watch] [--reset]` | 拉取消息（--watch 持续监听） |
| `npx weixin-mcp contacts` | 查看联系人（给 bot 发过消息的用户） |
| `npx weixin-mcp accounts [list]` | 列出所有账号 |
| `npx weixin-mcp accounts remove <id>` | 删除账号 |
| `npx weixin-mcp accounts clean` | 清理重复账号（同 userId 保留最新） |
| `npx weixin-mcp update` | 检查并更新到最新版 |
| `npx weixin-mcp --version` | 查看版本 |

### 短 ID 匹配

发送消息时可以用用户 ID 的前缀，只要在联系人中唯一匹配即可：

```bash
npx weixin-mcp send o9cq8 "hello"
# Resolved "o9cq8" → o9cq80x8ou646cs3Tt5EQgfsZRtI@im.wechat
```

## Claude Desktop 集成

在 `claude_desktop_config.json` 中添加：

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

重启 Claude Desktop 后即可使用。

## HTTP Daemon 模式

除了 stdio 模式，也可以启动 HTTP daemon 供多客户端连接：

```bash
npx weixin-mcp start --port 3001
```

MCP 端点：`http://localhost:3001/mcp`（StreamableHTTP）
健康检查：`http://localhost:3001/health`

## MCP 工具列表

| 工具名 | 说明 | 参数 |
|--------|------|------|
| `weixin_send` | 发送文本消息 | `to`、`text`、`context_token`（可选） |
| `weixin_poll` | 拉取新消息 | `reset_cursor`（可选） |
| `weixin_contacts` | 列出联系人 | 无 |
| `weixin_get_config` | 获取用户配置 | `user_id`、`context_token`（可选） |

## 数据存储路径

优先级：
1. `WEIXIN_MCP_DIR` 环境变量
2. `~/.openclaw/openclaw-weixin/`（已装 OpenClaw）
3. `~/.weixin-mcp/`（默认）

文件：
- `accounts/<accountId>.json` — 账号 token
- `accounts/<accountId>.cursor.json` — 消息游标
- `contacts.json` — 联系人
- `daemon.json` — daemon PID（仅 HTTP 模式）
- `daemon.log` — daemon 日志

## 环境变量

| 变量名 | 说明 |
|--------|------|
| `WEIXIN_MCP_DIR` | 自定义数据目录 |
| `WEIXIN_ACCOUNT_ID` | 指定使用哪个账号 |

## License

MIT
