# weixin-mcp

`weixin-mcp` 是一个基于 MCP 的微信服务端封装，复用 OpenClaw weixin 插件保存的账号 token，把微信能力暴露给 Claude Desktop 或其他 MCP 客户端。

## 功能

- 发送微信文本消息
- 获取联系人列表
- 拉取新消息
- 查询聊天历史
- 支持复用 OpenClaw weixin 插件已有登录态
- 支持独立扫码登录

## 安装

### 方式 1：直接用 `npx`

```bash
npx weixin-mcp
```

如果你只想执行扫码登录：

```bash
npx weixin-mcp weixin-login
```

更稳妥的做法是先安装到本地或全局，再运行下面的脚本。

### 方式 2：`npm install`

```bash
npm install
npm run build
```

构建后可用以下命令：

```bash
npm start
npm run login
```

## 使用方式

### 场景 A：已经安装 OpenClaw weixin 插件

如果你已经通过 OpenClaw weixin 插件登录过微信，并且本地已有 token 文件：

```bash
npm start
```

默认会从下面目录读取账号信息：

```bash
~/.openclaw/openclaw-weixin/accounts/
```

如果目录下有多个账号，可通过环境变量 `WEIXIN_ACCOUNT_ID` 指定。

### 场景 B：独立使用

如果你没有 OpenClaw weixin 插件，或者想单独给 `weixin-mcp` 登录：

```bash
npm run login
```

终端会显示二维码，扫码确认后会把 token 保存到本地。完成后启动 MCP server：

```bash
npm start
```

## Claude Desktop 集成

在 Claude Desktop 的 `claude_desktop_config.json` 中加入：

```json
{
  "mcpServers": {
    "weixin": {
      "command": "node",
      "args": ["/absolute/path/to/weixin-mcp/dist/index.js"],
      "env": {
        "OPENCLAW_STATE_DIR": "/Users/yourname/.openclaw",
        "WEIXIN_ACCOUNT_ID": "your-account-id"
      }
    }
  }
}
```

如果你是通过 npm 包安装，也可以直接用：

```json
{
  "mcpServers": {
    "weixin": {
      "command": "npx",
      "args": ["weixin-mcp"],
      "env": {
        "OPENCLAW_STATE_DIR": "/Users/yourname/.openclaw"
      }
    }
  }
}
```

修改配置后重启 Claude Desktop。

## 工具说明

| 工具名 | 说明 | 主要参数 |
| --- | --- | --- |
| `weixin_send` | 发送文本消息 | `to`, `text` |
| `weixin_get_contacts` | 获取联系人列表 | 无 |
| `weixin_poll_messages` | 拉取新消息 | `since_ts` 可选，毫秒时间戳 |
| `weixin_get_history` | 获取与某个联系人的聊天历史 | `to`, `limit` |

## 环境变量

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `OPENCLAW_STATE_DIR` | `~/.openclaw` | OpenClaw 状态目录，账号文件路径会解析为 `${OPENCLAW_STATE_DIR}/openclaw-weixin/accounts/` |
| `WEIXIN_ACCOUNT_ID` | 账号目录中的第一个账号 | 指定要使用的账号 ID，对应 `accounts/<accountId>.json` |

兼容性说明：

- `src/index.ts` 仍兼容读取旧变量 `CLAWDBOT_STATE_DIR`
- 若 token 失效，工具会返回清晰错误并提示重新执行 `npm run login`

## 常见问题

### 1. 提示找不到账号

先确认以下目录下是否存在 `*.json`：

```bash
~/.openclaw/openclaw-weixin/accounts/
```

如果没有，执行：

```bash
npm run login
```

### 2. 提示 token 过期或鉴权失败

重新扫码登录：

```bash
npm run login
```

### 3. 网络偶发失败

服务端会对网络错误自动重试 1 次。如果仍失败，请检查网络连接或微信接口可达性。

## 开发

```bash
npm install
npm run build
npm test
```
