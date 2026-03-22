/**
 * Account management commands:
 *   npx weixin-mcp accounts list        — list all accounts (default)
 *   npx weixin-mcp accounts remove <id> — remove a specific account
 *   npx weixin-mcp accounts clean       — remove duplicate accounts (same userId), keep newest
 *   npx weixin-mcp accounts use <id>    — print export WEIXIN_ACCOUNT_ID=<id>
 */
export declare function manageAccounts(args: string[]): Promise<void>;
