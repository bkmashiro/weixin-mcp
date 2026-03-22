/**
 * HTTP MCP server — runs as a daemon process.
 * Spawned by `weixin-mcp start`, listens on a given port.
 *
 * Clients connect via: http://localhost:<port>/mcp
 */

import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";

// Reuse the same tool definitions and handlers from the main server
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
import fs from "node:fs";
import path from "node:path";

const port = Number(process.env.WEIXIN_MCP_PORT ?? process.argv[2] ?? 3001);

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

// ── MCP server factory ─────────────────────────────────────────────────────

function createMCPServer() {
  const server = new Server(
    { name: "weixin-mcp", version: "1.2.2" },
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
            to: { type: "string" },
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
        result = await sendTextMessage(assertStr(a.to, "to"), assertStr(a.text, "text"), token!, baseUrl, a.context_token);
      } else if (name === "weixin_poll") {
        const { reset_cursor } = (args ?? {}) as { reset_cursor?: boolean };
        const cursor = reset_cursor ? "" : loadCursor(accountId);
        const resp = await getUpdates(token!, baseUrl, cursor);
        if (resp.get_updates_buf) saveCursor(accountId, resp.get_updates_buf);
        result = resp;
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

// ── Express HTTP server ────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Session store for stateful transports
const sessions = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  // Check if this is an existing session
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport = sessionId ? sessions.get(sessionId) : undefined;

  if (!transport) {
    // New session
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
  res.json({ status: "ok", port, sessions: sessions.size });
});

app.listen(port, () => {
  console.log(`[weixin-mcp] HTTP MCP server listening on port ${port}`);
  console.log(`[weixin-mcp] MCP endpoint: http://localhost:${port}/mcp`);
});
