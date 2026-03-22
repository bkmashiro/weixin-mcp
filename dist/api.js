import crypto from "node:crypto";
export const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
const AUTH_ERROR_STATUSES = new Set([401, 403]);
export class WeixinAuthError extends Error {
    constructor(message = "Authentication failed. Run npm run login to re-authenticate.") {
        super(message);
        this.name = "WeixinAuthError";
    }
}
export class WeixinNetworkError extends Error {
    constructor(message) {
        super(message);
        this.name = "WeixinNetworkError";
    }
}
export function generateClientId() {
    return `openclaw-weixin-mcp-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
async function parseErrorResponse(res) {
    try {
        const text = await res.text();
        return text.trim() || `HTTP ${res.status}`;
    }
    catch {
        return `HTTP ${res.status}`;
    }
}
function isTransientNetworkError(error) {
    return error instanceof TypeError || error instanceof WeixinNetworkError;
}
export async function weixinRequest(requestPath, body, token, baseUrl = DEFAULT_BASE_URL, retries = 1) {
    const url = `${baseUrl}${requestPath}`;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            });
            if (AUTH_ERROR_STATUSES.has(res.status)) {
                throw new WeixinAuthError();
            }
            if (!res.ok) {
                const message = await parseErrorResponse(res);
                throw new Error(`Weixin API error ${res.status}: ${message}`);
            }
            return res.json();
        }
        catch (error) {
            if (error instanceof WeixinAuthError) {
                throw error;
            }
            if (isTransientNetworkError(error) && attempt < retries) {
                continue;
            }
            if (isTransientNetworkError(error)) {
                throw new WeixinNetworkError(error instanceof Error ? error.message : "Network request failed");
            }
            throw error;
        }
    }
    throw new WeixinNetworkError("Network request failed");
}
export async function sendTextMessage(to, text, token, baseUrl) {
    return weixinRequest("/v1/message/send", {
        msg: {
            from_user_id: "",
            to_user_id: to,
            client_id: generateClientId(),
            message_type: 2,
            message_state: 2,
            item_list: [{ type: 1, text_item: { text } }],
        },
    }, token, baseUrl);
}
export async function getContacts(token, baseUrl) {
    return weixinRequest("/v1/contacts/list", { page_size: 50 }, token, baseUrl);
}
export async function pollMessages(token, baseUrl, sinceTs) {
    return weixinRequest("/v1/updates/get", {
        timeout_ms: 5000,
        ...(sinceTs ? { since_ts: sinceTs } : {}),
    }, token, baseUrl);
}
export async function getChatHistory(to, limit, token, baseUrl) {
    return weixinRequest("/v1/message/history", { to_user_id: to, limit }, token, baseUrl);
}
