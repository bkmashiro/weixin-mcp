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
import { DEFAULT_BASE_URL, getUpdates, getConfig, sendTextMessage, loadCursor, saveCursor, WeixinAuthError, WeixinNetworkError, } from "./api.js";
import { ACCOUNTS_DIR } from "./paths.js";
// ── Auth / config ──────────────────────────────────────────────────────────
const WEIXIN_DIR = ACCOUNTS_DIR;
function loadAccount() {
    const files = fs
        .readdirSync(WEIXIN_DIR)
        .filter((f) => f.endsWith(".json") && !f.endsWith(".sync.json") && !f.endsWith(".cursor.json"));
    if (files.length === 0)
        throw new Error("No WeChat account found. Run: npm run login");
    const accountId = process.env.WEIXIN_ACCOUNT_ID ?? files[0].replace(".json", "");
    const filePath = path.join(WEIXIN_DIR, `${accountId}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!data.token)
        throw new Error(`No token for account ${accountId}. Re-run: npm run login`);
    return { ...data, accountId };
}
// ── Helpers ────────────────────────────────────────────────────────────────
function assertNonEmptyString(value, field) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`Invalid argument "${field}": must be a non-empty string`);
    }
    return value.trim();
}
function formatToolError(error) {
    if (error instanceof WeixinAuthError)
        return error.message;
    if (error instanceof WeixinNetworkError)
        return `Network error: ${error.message}`;
    if (error instanceof Error)
        return error.message;
    return String(error);
}
// ── MCP Server ─────────────────────────────────────────────────────────────
const server = new Server({ name: "weixin-mcp", version: "1.0.2" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "weixin_send",
            description: "Send a WeChat text message to a user. Pass context_token from a received message to link the reply to the conversation thread.",
            inputSchema: {
                type: "object",
                properties: {
                    to: { type: "string", description: "Recipient user ID / OpenId" },
                    text: { type: "string", description: "Message text to send" },
                    context_token: {
                        type: "string",
                        description: "Optional: context_token from a received message, links the reply to the conversation",
                    },
                },
                required: ["to", "text"],
            },
        },
        {
            name: "weixin_poll",
            description: "Poll for new WeChat messages. Uses a persistent cursor to avoid re-delivering old messages. Returns new messages since last poll.",
            inputSchema: {
                type: "object",
                properties: {
                    reset_cursor: {
                        type: "boolean",
                        description: "If true, reset cursor and re-fetch from the beginning (useful for debugging)",
                    },
                },
            },
        },
        {
            name: "weixin_get_config",
            description: "Get bot config for a user — includes typing_ticket needed for sendTyping. Call before sending typing indicators.",
            inputSchema: {
                type: "object",
                properties: {
                    user_id: { type: "string", description: "Target user ID / OpenId" },
                    context_token: { type: "string", description: "Optional context token" },
                },
                required: ["user_id"],
            },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const account = loadAccount();
    const { token, baseUrl = DEFAULT_BASE_URL, accountId } = account;
    const { name, arguments: args } = req.params;
    try {
        let result;
        if (name === "weixin_send") {
            const { to, text, context_token } = (args ?? {});
            const validatedTo = assertNonEmptyString(to, "to");
            const validatedText = assertNonEmptyString(text, "text");
            result = await sendTextMessage(validatedTo, validatedText, token, baseUrl, context_token);
        }
        else if (name === "weixin_poll") {
            const { reset_cursor } = (args ?? {});
            const cursor = reset_cursor ? "" : loadCursor(accountId);
            const resp = await getUpdates(token, baseUrl, cursor);
            // Persist new cursor for next poll
            if (resp.get_updates_buf)
                saveCursor(accountId, resp.get_updates_buf);
            result = resp;
        }
        else if (name === "weixin_get_config") {
            const { user_id, context_token } = (args ?? {});
            const validatedUserId = assertNonEmptyString(user_id, "user_id");
            result = await getConfig(validatedUserId, token, baseUrl, context_token);
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
            content: [{ type: "text", text: `Error: ${formatToolError(err)}` }],
            isError: true,
        };
    }
});
// ── Start ──────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("WeChat MCP server running on stdio");
