export declare const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export declare class WeixinAuthError extends Error {
    constructor(message?: string);
}
export declare class WeixinNetworkError extends Error {
    constructor(message: string);
}
export declare function generateClientId(): string;
export declare function weixinRequest(endpoint: string, body: unknown, token: string, baseUrl?: string, retries?: number): Promise<unknown>;
/** Send a text message. Uses real endpoint: ilink/bot/sendmessage */
export declare function sendTextMessage(to: string, text: string, token: string, baseUrl: string): Promise<unknown>;
/** Long-poll for new messages. Uses real endpoint: ilink/bot/getupdates */
export declare function pollMessages(token: string, baseUrl: string, timeoutMs?: number): Promise<unknown>;
/** Get bot config for a user (includes context_token for replies). */
export declare function getConfig(ilinkUserId: string, token: string, baseUrl: string): Promise<unknown>;
export declare function getContacts(_token: string, _baseUrl: string): Promise<{
    note: string;
}>;
