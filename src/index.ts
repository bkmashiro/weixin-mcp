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
import {
  DEFAULT_BASE_URL,
  getUpdates,
  getConfig,
  sendTextMessage,
  sendImageMessage,
  sendFileMessage,
  loadCursor,
  saveCursor,
  WeixinAuthError,
  WeixinNetworkError,
} from "./api.js";
import { uploadMedia, downloadMedia } from "./cdn.js";
import { ACCOUNTS_DIR } from "./paths.js";
import { updateContactsFromMsgs, loadContacts, type ContactBook } from "./contacts.js";

/** Resolve short userId prefix to full ID from contacts. */
function resolveUserId(input: string, contacts: ContactBook): string {
  if (!input || input.includes("@")) return input;
  const ids = Object.keys(contacts);
  const matches = ids.filter((id) => id.startsWith(input) || id.includes(input));
  if (matches.length === 1) return matches[0];
  return input; // ambiguous or not found — use as-is
}

// ── Auth / config ──────────────────────────────────────────────────────────

const WEIXIN_DIR = ACCOUNTS_DIR;

interface AccountData {
  token?: string;
  baseUrl?: string;
  userId?: string;
  savedAt?: string;
}

function loadAccount(): AccountData & { accountId: string } {
  const files = fs
    .readdirSync(WEIXIN_DIR)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".sync.json") && !f.endsWith(".cursor.json"));
  if (files.length === 0)
    throw new Error("No WeChat account found. Run: npm run login");

  const accountId =
    process.env.WEIXIN_ACCOUNT_ID ?? files[0].replace(".json", "");
  const filePath = path.join(WEIXIN_DIR, `${accountId}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as AccountData;
  if (!data.token)
    throw new Error(`No token for account ${accountId}. Re-run: npm run login`);
  return { ...data, accountId };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid argument "${field}": must be a non-empty string`);
  }
  return value.trim();
}

function formatToolError(error: unknown): string {
  if (error instanceof WeixinAuthError) return error.message;
  if (error instanceof WeixinNetworkError)
    return `Network error: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

// ── MCP Server ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: "weixin-mcp", version: "1.0.2" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "weixin_send",
      description:
        "Send a WeChat text message to a user. Pass context_token from a received message to link the reply to the conversation thread.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient user ID (full or short prefix if unique in contacts)" },
          text: { type: "string", description: "Message text to send" },
          context_token: {
            type: "string",
            description:
              "Optional: context_token from a received message, links the reply to the conversation",
          },
        },
        required: ["to", "text"],
      },
    },
    {
      name: "weixin_poll",
      description:
        "Poll for new WeChat messages. Uses a persistent cursor to avoid re-delivering old messages. Returns new messages since last poll.",
      inputSchema: {
        type: "object",
        properties: {
          reset_cursor: {
            type: "boolean",
            description:
              "If true, reset cursor and re-fetch from the beginning (useful for debugging)",
          },
        },
      },
    },
    {
      name: "weixin_contacts",
      description:
        "List users who have messaged the bot. Returns userId, lastSeen, lastText, contextToken, msgCount. Use userId as 'to' in weixin_send.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "weixin_send_image",
      description:
        "Send an image to a WeChat user. Source can be a local file path or URL. Optionally include a text caption.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient user ID (full or short prefix)" },
          source: { type: "string", description: "Image source: local file path or URL" },
          caption: { type: "string", description: "Optional text caption to send with the image" },
          context_token: { type: "string", description: "Optional context_token to link reply" },
        },
        required: ["to", "source"],
      },
    },
    {
      name: "weixin_send_file",
      description:
        "Send a file attachment to a WeChat user. Source can be a local file path or URL.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient user ID (full or short prefix)" },
          source: { type: "string", description: "File source: local file path or URL" },
          caption: { type: "string", description: "Optional text caption to send with the file" },
          context_token: { type: "string", description: "Optional context_token to link reply" },
        },
        required: ["to", "source"],
      },
    },
    {
      name: "weixin_get_config",
      description:
        "Get bot config for a user — includes typing_ticket needed for sendTyping. Call before sending typing indicators.",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Target user ID / OpenId" },
          context_token: { type: "string", description: "Optional context token" },
        },
        required: ["user_id"],
      },
    },
    {
      name: "weixin_download",
      description:
        "Download media (image/file/video) from a received message. Extract encrypt_query_param and aes_key from the message's image_item, file_item, or video_item.",
      inputSchema: {
        type: "object",
        properties: {
          encrypt_query_param: { 
            type: "string", 
            description: "The encrypt_query_param from the media item (e.g., image_item.media.encrypt_query_param)" 
          },
          aes_key: { 
            type: "string", 
            description: "The AES key (hex string) from the media item (e.g., image_item.aeskey)" 
          },
        },
        required: ["encrypt_query_param", "aes_key"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const account = loadAccount();
  const { token, baseUrl = DEFAULT_BASE_URL, accountId } = account;

  const { name, arguments: args } = req.params;

  try {
    let result: unknown;

    if (name === "weixin_send") {
      const { to, text, context_token } = (args ?? {}) as {
        to?: string;
        text?: string;
        context_token?: string;
      };
      const validatedTo = assertNonEmptyString(to, "to");
      const resolvedTo = resolveUserId(validatedTo, loadContacts());
      const validatedText = assertNonEmptyString(text, "text");
      result = await sendTextMessage(
        resolvedTo,
        validatedText,
        token!,
        baseUrl,
        context_token,
      );
    } else if (name === "weixin_poll") {
      const { reset_cursor } = (args ?? {}) as { reset_cursor?: boolean };
      const cursor = reset_cursor ? "" : loadCursor(accountId);
      const resp = await getUpdates(token!, baseUrl, cursor);
      // Persist new cursor for next poll
      if (resp.get_updates_buf) saveCursor(accountId, resp.get_updates_buf);
      if (resp.msgs && resp.msgs.length > 0) updateContactsFromMsgs(resp.msgs as unknown[]);
      result = resp;
    } else if (name === "weixin_contacts") {
      result = Object.values(loadContacts());
    } else if (name === "weixin_send_image") {
      const { to, source, caption, context_token } = (args ?? {}) as {
        to?: string;
        source?: string;
        caption?: string;
        context_token?: string;
      };
      const validatedTo = assertNonEmptyString(to, "to");
      const resolvedTo = resolveUserId(validatedTo, loadContacts());
      const validatedSource = assertNonEmptyString(source, "source");
      const uploaded = await uploadMedia({
        source: validatedSource,
        mediaType: "image",
        toUserId: resolvedTo,
        token: token!,
        baseUrl,
      });
      await sendImageMessage(resolvedTo, uploaded, token!, baseUrl, context_token, caption);
      result = { success: true, filekey: uploaded.filekey };
    } else if (name === "weixin_send_file") {
      const { to, source, caption, context_token } = (args ?? {}) as {
        to?: string;
        source?: string;
        caption?: string;
        context_token?: string;
      };
      const validatedTo = assertNonEmptyString(to, "to");
      const resolvedTo = resolveUserId(validatedTo, loadContacts());
      const validatedSource = assertNonEmptyString(source, "source");
      const uploaded = await uploadMedia({
        source: validatedSource,
        mediaType: "file",
        toUserId: resolvedTo,
        token: token!,
        baseUrl,
      });
      await sendFileMessage(resolvedTo, uploaded, token!, baseUrl, context_token, caption);
      result = { success: true, filekey: uploaded.filekey, fileName: uploaded.fileName };
    } else if (name === "weixin_get_config") {
      const { user_id, context_token } = (args ?? {}) as {
        user_id?: string;
        context_token?: string;
      };
      const validatedUserId = assertNonEmptyString(user_id, "user_id");
      result = await getConfig(validatedUserId, token!, baseUrl, context_token);
    } else if (name === "weixin_download") {
      const { encrypt_query_param, aes_key } = (args ?? {}) as {
        encrypt_query_param?: string;
        aes_key?: string;
      };
      const validatedParam = assertNonEmptyString(encrypt_query_param, "encrypt_query_param");
      const validatedKey = assertNonEmptyString(aes_key, "aes_key");
      const data = await downloadMedia({
        encryptQueryParam: validatedParam,
        aesKey: validatedKey,
      });
      // Return as base64 with size info
      result = {
        success: true,
        size: data.length,
        base64: data.toString("base64"),
      };
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
