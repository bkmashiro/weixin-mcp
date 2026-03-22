#!/usr/bin/env node
/**
 * WeChat MCP Server
 * Exposes WeChat messaging as MCP tools, reusing token from OpenClaw weixin plugin.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  DEFAULT_BASE_URL,
  
  getContacts,
  pollMessages,
  sendTextMessage,
  WeixinAuthError,
  WeixinNetworkError,
} from "./api.js";

// ── Auth / config ──────────────────────────────────────────────────────────

const STATE_DIR =
  process.env.OPENCLAW_STATE_DIR?.trim() ||
  process.env.CLAWDBOT_STATE_DIR?.trim() ||
  path.join(os.homedir(), ".openclaw");

const WEIXIN_DIR = path.join(STATE_DIR, "openclaw-weixin", "accounts");

interface AccountData {
  token?: string;
  baseUrl?: string;
  userId?: string;
  savedAt?: string;
}

function loadAccount(): AccountData & { accountId: string } {
  const files = fs.readdirSync(WEIXIN_DIR).filter((f) => f.endsWith(".json") && !f.endsWith(".sync.json"));
  if (files.length === 0) throw new Error("No WeChat account found. Run: npx @tencent-weixin/openclaw-weixin-cli install");

  // Pick the first (or explicitly set) account
  const accountId = process.env.WEIXIN_ACCOUNT_ID ?? files[0].replace(".json", "");
  const filePath = path.join(WEIXIN_DIR, `${accountId}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as AccountData;
  if (!data.token) throw new Error(`No token for account ${accountId}. Re-run QR login.`);
  return { ...data, accountId };
}

// ── Weixin API ─────────────────────────────────────────────────────────────

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid argument "${field}": must be a non-empty string`);
  }
  return value.trim();
}

function formatToolError(error: unknown): string {
  if (error instanceof WeixinAuthError) {
    return error.message;
  }

  if (error instanceof WeixinNetworkError) {
    return `Network error while calling Weixin API: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

// ── MCP Server ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: "weixin-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

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
  const { token, baseUrl = DEFAULT_BASE_URL } = account;

  const { name, arguments: args } = req.params;

  try {
    let result: unknown;

    if (name === "weixin_send") {
      const { to, text } = (args ?? {}) as { to?: string; text?: string };
      const validatedTo = assertNonEmptyString(to, "to");
      const validatedText = assertNonEmptyString(text, "text");
      result = await sendTextMessage(validatedTo, validatedText, token!, baseUrl);
    } else if (name === "weixin_get_contacts") {
      result = await getContacts(token!, baseUrl);
    } else if (name === "weixin_poll_messages") {
      const { since_ts } = (args ?? {}) as { since_ts?: number };
      result = await pollMessages(token!, baseUrl, since_ts);
    } else if (name === "weixin_get_history") {
      const { to, limit = 20 } = (args ?? {}) as { to?: string; limit?: number };
      result = { note: "WeChat bot API does not support fetching chat history." };
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
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
