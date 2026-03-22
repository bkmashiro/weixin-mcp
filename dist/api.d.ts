export declare const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export declare class WeixinAuthError extends Error {
    constructor(message?: string);
}
export declare class WeixinNetworkError extends Error {
    constructor(message: string);
}
export declare function generateClientId(): string;
export declare function loadCursor(accountId: string): string;
export declare function saveCursor(accountId: string, cursor: string): void;
export declare function weixinRequest(endpoint: string, body: unknown, token: string, baseUrl?: string, retries?: number): Promise<unknown>;
/**
 * Send a text message.
 * Pass contextToken from the received message to link the reply to the conversation.
 */
export declare function sendTextMessage(to: string, text: string, token: string, baseUrl: string, contextToken?: string): Promise<unknown>;
/**
 * Long-poll for new messages.
 * Pass the cursor from the previous response to avoid re-receiving old messages.
 */
export declare function getUpdates(token: string, baseUrl: string, cursor?: string): Promise<{
    msgs?: unknown[];
    get_updates_buf?: string;
    ret?: number;
    errcode?: number;
}>;
/**
 * Get bot config for a user (includes typing_ticket and context_token).
 */
export declare function getConfig(ilinkUserId: string, token: string, baseUrl: string, contextToken?: string): Promise<unknown>;
/**
 * Send typing indicator.
 * status: 1 = typing, 2 = cancel
 */
export declare function sendTyping(ilinkUserId: string, typingTicket: string, status: 1 | 2, token: string, baseUrl: string): Promise<unknown>;
