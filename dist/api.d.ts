export declare const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
export declare class WeixinAuthError extends Error {
    constructor(message?: string);
}
export declare class WeixinNetworkError extends Error {
    constructor(message: string);
}
export declare function generateClientId(): string;
export declare function weixinRequest(requestPath: string, body: unknown, token: string, baseUrl?: string, retries?: number): Promise<unknown>;
export declare function sendTextMessage(to: string, text: string, token: string, baseUrl: string): Promise<unknown>;
export declare function getContacts(token: string, baseUrl: string): Promise<unknown>;
export declare function pollMessages(token: string, baseUrl: string, sinceTs?: number): Promise<unknown>;
export declare function getChatHistory(to: string, limit: number, token: string, baseUrl: string): Promise<unknown>;
