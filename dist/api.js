import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
export const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
const CHANNEL_VERSION = "1.0.2";
export class WeixinAuthError extends Error {
    constructor(message = "Authentication failed. Run: npm run login") {
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
// ── Helpers ────────────────────────────────────────────────────────────────
export function generateClientId() {
    return `weixin-mcp-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
/** X-WECHAT-UIN: base64-encoded random uint32, required by backend */
function randomWechatUin() {
    const buf = crypto.randomBytes(4);
    return buf.toString("base64");
}
function buildHeaders(token, bodyStr) {
    return {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(bodyStr, "utf-8")),
        "AuthorizationType": "ilink_bot_token",
        "Authorization": `Bearer ${token}`,
        "X-WECHAT-UIN": randomWechatUin(),
    };
}
// ── Cursor persistence ─────────────────────────────────────────────────────
const STATE_DIR = process.env.OPENCLAW_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".openclaw");
function cursorPath(accountId) {
    return path.join(STATE_DIR, "openclaw-weixin", "accounts", `${accountId}.cursor.json`);
}
export function loadCursor(accountId) {
    try {
        const data = JSON.parse(fs.readFileSync(cursorPath(accountId), "utf-8"));
        return data.cursor ?? "";
    }
    catch {
        return "";
    }
}
export function saveCursor(accountId, cursor) {
    try {
        fs.writeFileSync(cursorPath(accountId), JSON.stringify({ cursor }));
    }
    catch {
        // non-fatal
    }
}
// ── Core request ───────────────────────────────────────────────────────────
async function parseErrorResponse(res) {
    try {
        return (await res.text()).trim() || `HTTP ${res.status}`;
    }
    catch {
        return `HTTP ${res.status}`;
    }
}
export async function weixinRequest(endpoint, body, token, baseUrl = DEFAULT_BASE_URL, retries = 1) {
    const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const url = new URL(endpoint, base).toString();
    const bodyStr = JSON.stringify(body);
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: buildHeaders(token, bodyStr),
                body: bodyStr,
            });
            if (res.status === 401 || res.status === 403)
                throw new WeixinAuthError();
            if (!res.ok) {
                const msg = await parseErrorResponse(res);
                throw new Error(`Weixin API error ${res.status}: ${msg}`);
            }
            return res.json();
        }
        catch (err) {
            if (err instanceof WeixinAuthError)
                throw err;
            if (err instanceof TypeError && attempt < retries)
                continue; // network retry
            if (err instanceof TypeError)
                throw new WeixinNetworkError(String(err));
            throw err;
        }
    }
    throw new WeixinNetworkError("Network request failed after retries");
}
// ── API functions ──────────────────────────────────────────────────────────
/**
 * Send a text message.
 * Pass contextToken from the received message to link the reply to the conversation.
 */
export async function sendTextMessage(to, text, token, baseUrl, contextToken) {
    return weixinRequest("ilink/bot/sendmessage", {
        msg: {
            from_user_id: "",
            to_user_id: to,
            client_id: generateClientId(),
            message_type: 2, // BOT
            message_state: 2, // FINISH
            item_list: [{ type: 1, text_item: { text } }],
            ...(contextToken ? { context_token: contextToken } : {}),
        },
        base_info: { channel_version: CHANNEL_VERSION },
    }, token, baseUrl);
}
/**
 * Long-poll for new messages.
 * Pass the cursor from the previous response to avoid re-receiving old messages.
 */
export async function getUpdates(token, baseUrl, cursor = "") {
    return weixinRequest("ilink/bot/getupdates", {
        get_updates_buf: cursor,
        base_info: { channel_version: CHANNEL_VERSION },
    }, token, baseUrl);
}
/**
 * Get bot config for a user (includes typing_ticket and context_token).
 */
export async function getConfig(ilinkUserId, token, baseUrl, contextToken) {
    return weixinRequest("ilink/bot/getconfig", {
        ilink_user_id: ilinkUserId,
        ...(contextToken ? { context_token: contextToken } : {}),
        base_info: { channel_version: CHANNEL_VERSION },
    }, token, baseUrl);
}
/**
 * Send typing indicator.
 * status: 1 = typing, 2 = cancel
 */
export async function sendTyping(ilinkUserId, typingTicket, status, token, baseUrl) {
    return weixinRequest("ilink/bot/sendtyping", {
        ilink_user_id: ilinkUserId,
        typing_ticket: typingTicket,
        status,
        base_info: { channel_version: CHANNEL_VERSION },
    }, token, baseUrl);
}
