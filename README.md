# weixin-mcp

基于 MCP 协议的微信消息服务端——将微信能力暴露为 MCP 工具，供 Claude Desktop 及其他 MCP 客户端使用。

支持复用 [OpenClaw weixin 插件](https://www.npmjs.com/package/@tencent-weixin/openclaw-weixin) 的已有登录态，或独立扫码登录。

[English](./README.en.md)

## 快速开始

### 第一步 — 登录（首次使用）

```bash
npx weixin-login
```

终端会显示二维码，微信扫码确认后 token 自动保存到本地。

### 第二步 — 启动 MCP 服务

```bash
npx weixin-mcp
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

重启 Claude Desktop 后，即可让 Claude 直接发送微信消息或拉取新消息。

## 工具列表

| 工具名 | 说明 | 参数 |
|--------|------|------|
| `weixin_send` | 发送文本消息 | `to`（用户 ID）、`text`、`context_token`（可选，关联会话） |
| `weixin_poll` | 拉取新消息（基于游标，不重复） | `reset_cursor`（可选布尔值） |
| `weixin_get_config` | 获取用户配置（typing ticket 等） | `user_id`、`context_token`（可选） |

## 已有 OpenClaw weixin 插件？

如果已通过 OpenClaw 完成微信登录，无需重新登录——`npx weixin-mcp` 会自动复用已有 token。

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `OPENCLAW_STATE_DIR` | `~/.openclaw` | 状态目录，账号文件读取路径为 `$OPENCLAW_STATE_DIR/openclaw-weixin/accounts/` |
| `WEIXIN_ACCOUNT_ID` | 目录中第一个账号 | 指定使用哪个账号（对应文件名去掉 `.json`） |

## Token 过期重新登录

```bash
npx weixin-login
```

## License

MIT
