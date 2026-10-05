/**
 * Resolve the accounts directory.
 *
 * Priority:
 * 1. WEIXIN_MCP_DIR env var (explicit override)
 * 2. If OpenClaw state dir exists → ~/.openclaw/openclaw-weixin/accounts/ (backward compat)
 * 3. Default → ~/.weixin-mcp/accounts/
 */
export declare const ACCOUNTS_DIR: string;
export declare const DATA_DIR: string;
export declare function isAccountFile(file: string): boolean;
