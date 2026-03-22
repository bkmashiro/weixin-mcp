/**
 * HTTP MCP server — runs as a daemon process.
 * Spawned by `weixin-mcp start`, listens on a given port.
 *
 * Features:
 * - MCP endpoint at /mcp (StreamableHTTP)
 * - Health check at /health
 * - Webhook push: --webhook <url> to receive new messages via POST
 * - Auto-poll: when webhook is set, background polling forwards messages
 */

import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";

import {
  DEFAULT_BASE_URL,
  getUpdates,
  getConfig,
  sendTextMessage,
  loadCursor,
  saveCursor,
  WeixinAuthError,
  WeixinNetworkError,
} from "./api.js";
import { ACCOUNTS_DIR } from "./paths.js";
import { updateContactsFromMsgs, loadContacts, type ContactBook } from "./contacts.js";
import fs from "node:fs";
import path from "node:path";

// Parse CLI args
const args = process.argv.slice(2);
const portIdx = args.indexOf("--port");
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : Number(process.env.WEIXIN_MCP_PORT ?? 3001);
const webhookIdx = args.indexOf("--webhook");
const webhookUrl = webhookIdx >= 0 ? args[webhookIdx + 1] : process.env.WEIXIN_WEBHOOK_URL;

// ── Account loader ─────────────────────────────────────────────────────────

interface AccountData { token?: string; baseUrl?: string; userId?: string }

function loadAccount(): AccountData & { accountId: string } {
  const files = fs.readdirSync(ACCOUNTS_DIR).filter(
    (f) => f.endsWith(".json") && !f.endsWith(".sync.json") && !f.endsWith(".cursor.json"),
  );
  if (files.length === 0) throw new Error("No WeChat account. Run: npx weixin-mcp login");
  const accountId = process.env.WEIXIN_ACCOUNT_ID ?? files[0].replace(".json", "");
  const data = JSON.parse(fs.readFileSync(path.join(ACCOUNTS_DIR, `${accountId}.json`), "utf-8")) as AccountData;
  if (!data.token) throw new Error(`No token for ${accountId}. Run: npx weixin-mcp login`);
  return { ...data, accountId };
}

function assertStr(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.trim()) throw new Error(`"${f}" must be a non-empty string`);
  return v.trim();
}

function fmtErr(e: unknown): string {
  if (e instanceof WeixinAuthError || e instanceof WeixinNetworkError || e instanceof Error) return e.message;
  return String(e);
}

function resolveUserId(input: string, contacts: ContactBook): string {
  if (!input || input.includes("@")) return input;
  const ids = Object.keys(contacts);
  const matches = ids.filter((id) => id.startsWith(input) || id.includes(input));
  if (matches.length === 1) return matches[0];
  return input;
}

// ── MCP server factory ─────────────────────────────────────────────────────

function createMCPServer() {
  const server = new Server(
    { name: "weixin-mcp", version: "1.5.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "weixin_send",
        description: "Send a WeChat text message. Pass context_token from a received message to link the reply.",
        inputSchema: {
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient (full ID or short prefix)" },
            text: { type: "string" },
            context_token: { type: "string" },
          },
          required: ["to", "text"],
        },
      },
      {
        name: "weixin_poll",
        description: "Poll for new WeChat messages (cursor-based, no duplicates).",
        inputSchema: {
          type: "object",
          properties: { reset_cursor: { type: "boolean" } },
        },
      },
      {
        name: "weixin_contacts",
        description: "List users who have messaged the bot.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "weixin_get_config",
        description: "Get user config (typing ticket, etc.).",
        inputSchema: {
          type: "object",
          properties: {
            user_id: { type: "string" },
            context_token: { type: "string" },
          },
          required: ["user_id"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { token, baseUrl = DEFAULT_BASE_URL, accountId } = loadAccount();
    const { name, arguments: args } = req.params;
    try {
      let result: unknown;
      if (name === "weixin_send") {
        const a = (args ?? {}) as { to?: string; text?: string; context_token?: string };
        const resolvedTo = resolveUserId(assertStr(a.to, "to"), loadContacts());
        result = await sendTextMessage(resolvedTo, assertStr(a.text, "text"), token!, baseUrl, a.context_token);
      } else if (name === "weixin_poll") {
        const { reset_cursor } = (args ?? {}) as { reset_cursor?: boolean };
        const cursor = reset_cursor ? "" : loadCursor(accountId);
        const resp = await getUpdates(token!, baseUrl, cursor);
        if (resp.get_updates_buf) saveCursor(accountId, resp.get_updates_buf);
        if (resp.msgs && resp.msgs.length > 0) updateContactsFromMsgs(resp.msgs as unknown[]);
        result = resp;
      } else if (name === "weixin_contacts") {
        result = Object.values(loadContacts());
      } else if (name === "weixin_get_config") {
        const a = (args ?? {}) as { user_id?: string; context_token?: string };
        result = await getConfig(assertStr(a.user_id, "user_id"), token!, baseUrl, a.context_token);
      } else {
        throw new Error(`Unknown tool: ${name}`);
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${fmtErr(err)}` }], isError: true };
    }
  });

  return server;
}

// ── Webhook push ───────────────────────────────────────────────────────────

async function pushToWebhook(msgs: unknown[]) {
  if (!webhookUrl || msgs.length === 0) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "weixin_messages", messages: msgs, timestamp: new Date().toISOString() }),
    });
  } catch (err) {
    console.error("[weixin-mcp] webhook push failed:", fmtErr(err));
  }
}

// ── Background poller (when webhook is set) ────────────────────────────────

async function startBackgroundPoller() {
  if (!webhookUrl) return;
  console.log(`[weixin-mcp] Webhook enabled: ${webhookUrl}`);
  console.log("[weixin-mcp] Starting background poller...");

  while (true) {
    try {
      const { token, baseUrl = DEFAULT_BASE_URL, accountId } = loadAccount();
      const cursor = loadCursor(accountId);
      const resp = await getUpdates(token!, baseUrl, cursor);

      if (resp.get_updates_buf) saveCursor(accountId, resp.get_updates_buf);

      if (resp.msgs && resp.msgs.length > 0) {
        updateContactsFromMsgs(resp.msgs as unknown[]);
        await pushToWebhook(resp.msgs);
        console.log(`[weixin-mcp] Pushed ${resp.msgs.length} message(s) to webhook`);
      }
    } catch (err) {
      console.error("[weixin-mcp] poll error:", fmtErr(err));
      await new Promise((r) => setTimeout(r, 5000)); // backoff on error
    }
    // getUpdates is long-poll (~30s timeout), so no extra delay needed
  }
}

// ── Express HTTP server ────────────────────────────────────────────────────

const app = express();
app.use(express.json());

const sessions = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport = sessionId ? sessions.get(sessionId) : undefined;

  if (!transport) {
    const newSessionId = randomUUID();
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (id) => { sessions.set(id, transport!); },
    });
    transport.onclose = () => { sessions.delete(newSessionId); };
    const server = createMCPServer();
    await server.connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? sessions.get(sessionId) : undefined;
  if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
  await transport.handleRequest(req, res);
});

app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? sessions.get(sessionId) : undefined;
  if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
  await transport.handleRequest(req, res);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", port, sessions: sessions.size, webhook: webhookUrl ?? null });
});

app.listen(port, () => {
  console.log(`[weixin-mcp] HTTP MCP server on port ${port}`);
  console.log(`[weixin-mcp] MCP: http://localhost:${port}/mcp`);
  if (webhookUrl) startBackgroundPoller();
});
