/**
 * CLI messaging commands:
 *   npx weixin-mcp send <userId> <text>   — send a message
 *   npx weixin-mcp poll [--watch] [--reset] — poll for messages (once or continuous)
 */
export declare function cliSend(args: string[]): Promise<void>;
export declare function cliPoll(args: string[]): Promise<void>;
