#!/usr/bin/env node
/**
 * WeChat MCP Server
 * Exposes WeChat messaging as MCP tools, reusing token from OpenClaw weixin plugin.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
// ── Auth / config ──────────────────────────────────────────────────────────
const STATE_DIR = process.env.OPENCLAW_STATE_DIR?.trim() ||
    process.env.CLAWDBOT_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".openclaw");
const WEIXIN_DIR = path.join(STATE_DIR, "openclaw-weixin", "accounts");
function loadAccount() {
    const files = fs.readdirSync(WEIXIN_DIR).filter((f) => f.endsWith(".json") && !f.endsWith(".sync.json"));
    if (files.length === 0)
        throw new Error("No WeChat account found. Run: npx @tencent-weixin/openclaw-weixin-cli install");
    // Pick the first (or explicitly set) account
    const accountId = process.env.WEIXIN_ACCOUNT_ID ?? files[0].replace(".json", "");
    const filePath = path.join(WEIXIN_DIR, `${accountId}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!data.token)
        throw new Error(`No token for account ${accountId}. Re-run QR login.`);
    return { ...data, accountId };
}
// ── Weixin API ─────────────────────────────────────────────────────────────
const BASE_URL = "https://ilinkai.weixin.qq.com";
function generateClientId() {
    return `openclaw-weixin-mcp-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
async function weixinRequest(path, body, token, baseUrl = BASE_URL) {
    const url = `${baseUrl}${path}`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Weixin API error ${res.status}: ${text}`);
    }
    return res.json();
}
async function sendTextMessage(to, text, token, baseUrl) {
    return weixinRequest("/v1/message/send", {
        msg: {
            from_user_id: "",
            to_user_id: to,
            client_id: generateClientId(),
            message_type: 2, // BOT
            message_state: 2, // FINISH
            item_list: [{ type: 1, text_item: { text } }], // TEXT
        },
    }, token, baseUrl);
}
async function getContacts(token, baseUrl) {
    return weixinRequest("/v1/contacts/list", { page_size: 50 }, token, baseUrl);
}
async function pollMessages(token, baseUrl, sinceTs) {
    return weixinRequest("/v1/updates/get", {
        timeout_ms: 5000,
        ...(sinceTs ? { since_ts: sinceTs } : {}),
    }, token, baseUrl);
}
async function getChatHistory(to, limit, token, baseUrl) {
    return weixinRequest("/v1/message/history", { to_user_id: to, limit }, token, baseUrl);
}
// ── MCP Server ─────────────────────────────────────────────────────────────
const server = new Server({ name: "weixin-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "weixin_send",
            description: "Send a WeChat message to a user (by user ID or OpenId)",
            inputSchema: {
                type: "object",
                properties: {
                    to: { type: "string", description: "Recipient user ID / OpenId" },
                    text: { type: "string", description: "Message text to send" },
                },
                required: ["to", "text"],
            },
        },
        {
            name: "weixin_get_contacts",
            description: "List WeChat contacts",
            inputSchema: { type: "object", properties: {} },
        },
        {
            name: "weixin_poll_messages",
            description: "Poll for new WeChat messages since a timestamp",
            inputSchema: {
                type: "object",
                properties: {
                    since_ts: { type: "number", description: "Unix timestamp in ms (optional)" },
                },
            },
        },
        {
            name: "weixin_get_history",
            description: "Get chat history with a WeChat contact",
            inputSchema: {
                type: "object",
                properties: {
                    to: { type: "string", description: "Contact user ID / OpenId" },
                    limit: { type: "number", description: "Number of messages (default 20)" },
                },
                required: ["to"],
            },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const account = loadAccount();
    const { token, baseUrl = BASE_URL } = account;
    const { name, arguments: args } = req.params;
    try {
        let result;
        if (name === "weixin_send") {
            const { to, text } = args;
            result = await sendTextMessage(to, text, token, baseUrl);
        }
        else if (name === "weixin_get_contacts") {
            result = await getContacts(token, baseUrl);
        }
        else if (name === "weixin_poll_messages") {
            const { since_ts } = (args ?? {});
            result = await pollMessages(token, baseUrl, since_ts);
        }
        else if (name === "weixin_get_history") {
            const { to, limit = 20 } = args;
            result = await getChatHistory(to, limit, token, baseUrl);
        }
        else {
            throw new Error(`Unknown tool: ${name}`);
        }
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: `Error: ${String(err)}` }],
            isError: true,
        };
    }
});
// ── Start ──────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("WeChat MCP server running on stdio");
