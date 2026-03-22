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
export {};
