/**
 * Resolve the accounts directory.
 *
 * Priority:
 * 1. WEIXIN_MCP_DIR env var (explicit override)
 * 2. If OpenClaw state dir exists → ~/.openclaw/openclaw-weixin/accounts/ (backward compat)
 * 3. Default → ~/.weixin-mcp/accounts/
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
function resolveAccountsDir() {
    // Explicit override
    if (process.env.WEIXIN_MCP_DIR?.trim()) {
        return process.env.WEIXIN_MCP_DIR.trim();
    }
    // OpenClaw compat: if the OpenClaw weixin accounts dir exists, use it
    const openclawStateDir = process.env.OPENCLAW_STATE_DIR?.trim() ||
        process.env.CLAWDBOT_STATE_DIR?.trim() ||
        path.join(os.homedir(), ".openclaw");
    const openclawAccountsDir = path.join(openclawStateDir, "openclaw-weixin", "accounts");
    if (fs.existsSync(openclawAccountsDir)) {
        return openclawAccountsDir;
    }
    // Default: standalone ~/.weixin-mcp/accounts/
    return path.join(os.homedir(), ".weixin-mcp", "accounts");
}
export const ACCOUNTS_DIR = resolveAccountsDir();
