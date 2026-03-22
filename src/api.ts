import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
const CHANNEL_VERSION = "1.0.2";

export class WeixinAuthError extends Error {
  constructor(message = "Authentication failed. Run: npm run login") {
    super(message);
    this.name = "WeixinAuthError";
  }
}

export class WeixinNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeixinNetworkError";
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function generateClientId(): string {
  return `weixin-mcp-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/** X-WECHAT-UIN: base64-encoded random uint32, required by backend */
function randomWechatUin(): string {
  const buf = crypto.randomBytes(4);
  return buf.toString("base64");
}

function buildHeaders(token: string, bodyStr: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(bodyStr, "utf-8")),
    "AuthorizationType": "ilink_bot_token",
    "Authorization": `Bearer ${token}`,
    "X-WECHAT-UIN": randomWechatUin(),
  };
}

// ── Cursor persistence ─────────────────────────────────────────────────────

import { ACCOUNTS_DIR } from "./paths.js";

function cursorPath(accountId: string): string {
  return path.join(ACCOUNTS_DIR, `${accountId}.cursor.json`);
}

export function loadCursor(accountId: string): string {
  try {
    const data = JSON.parse(fs.readFileSync(cursorPath(accountId), "utf-8")) as { cursor?: string };
    return data.cursor ?? "";
  } catch {
    return "";
  }
}

export function saveCursor(accountId: string, cursor: string): void {
  try {
    fs.writeFileSync(cursorPath(accountId), JSON.stringify({ cursor }));
  } catch {
    // non-fatal
  }
}

// ── Core request ───────────────────────────────────────────────────────────

async function parseErrorResponse(res: Response): Promise<string> {
  try {
    return (await res.text()).trim() || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function weixinRequest(
  endpoint: string,
  body: unknown,
  token: string,
  baseUrl = DEFAULT_BASE_URL,
  retries = 1,
): Promise<unknown> {
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

      if (res.status === 401 || res.status === 403) throw new WeixinAuthError();
      if (!res.ok) {
        const msg = await parseErrorResponse(res);
        throw new Error(`Weixin API error ${res.status}: ${msg}`);
      }
      return res.json();
    } catch (err) {
      if (err instanceof WeixinAuthError) throw err;
      if (err instanceof TypeError && attempt < retries) continue; // network retry
      if (err instanceof TypeError) throw new WeixinNetworkError(String(err));
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
export async function sendTextMessage(
  to: string,
  text: string,
  token: string,
  baseUrl: string,
  contextToken?: string,
) {
  return weixinRequest(
    "ilink/bot/sendmessage",
    {
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: generateClientId(),
        message_type: 2,  // BOT
        message_state: 2, // FINISH
        item_list: [{ type: 1, text_item: { text } }],
        ...(contextToken ? { context_token: contextToken } : {}),
      },
      base_info: { channel_version: CHANNEL_VERSION },
    },
    token,
    baseUrl,
  );
}

/**
 * Long-poll for new messages.
 * Pass the cursor from the previous response to avoid re-receiving old messages.
 */
export async function getUpdates(
  token: string,
  baseUrl: string,
  cursor = "",
): Promise<{ msgs?: unknown[]; get_updates_buf?: string; ret?: number; errcode?: number }> {
  return weixinRequest(
    "ilink/bot/getupdates",
    {
      get_updates_buf: cursor,
      base_info: { channel_version: CHANNEL_VERSION },
    },
    token,
    baseUrl,
  ) as Promise<{ msgs?: unknown[]; get_updates_buf?: string; ret?: number; errcode?: number }>;
}

/**
 * Get bot config for a user (includes typing_ticket and context_token).
 */
export async function getConfig(ilinkUserId: string, token: string, baseUrl: string, contextToken?: string) {
  return weixinRequest(
    "ilink/bot/getconfig",
    {
      ilink_user_id: ilinkUserId,
      ...(contextToken ? { context_token: contextToken } : {}),
      base_info: { channel_version: CHANNEL_VERSION },
    },
    token,
    baseUrl,
  );
}

/**
 * Send typing indicator.
 * status: 1 = typing, 2 = cancel
 */
export async function sendTyping(
  ilinkUserId: string,
  typingTicket: string,
  status: 1 | 2,
  token: string,
  baseUrl: string,
) {
  return weixinRequest(
    "ilink/bot/sendtyping",
    {
      ilink_user_id: ilinkUserId,
      typing_ticket: typingTicket,
      status,
      base_info: { channel_version: CHANNEL_VERSION },
    },
    token,
    baseUrl,
  );
}

// ── Media message types ────────────────────────────────────────────────────

export interface UploadedMedia {
  filekey: string;
  downloadEncryptedQueryParam: string;
  aeskey: string;
  fileSize: number;
  fileSizeCiphertext: number;
  fileName?: string;
}

/**
 * Send an image message using a previously uploaded file.
 */
export async function sendImageMessage(
  to: string,
  uploaded: UploadedMedia,
  token: string,
  baseUrl: string,
  contextToken?: string,
  caption?: string,
) {
  const items: Array<{ type: number; text_item?: { text: string }; image_item?: unknown }> = [];
  if (caption) items.push({ type: 1, text_item: { text: caption } });
  items.push({
    type: 2,
    image_item: {
      media: {
        encrypt_query_param: uploaded.downloadEncryptedQueryParam,
        // Official SDK does Buffer.from(hexString).toString("base64") — hex as UTF-8 string
        aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
        encrypt_type: 1,
      },
      aeskey: uploaded.aeskey, // hex string for client decryption
      mid_size: uploaded.fileSizeCiphertext,
    },
  });

  // Send each item separately (text caption + image)
  for (const item of items) {
    await weixinRequest(
      "ilink/bot/sendmessage",
      {
        msg: {
          from_user_id: "",
          to_user_id: to,
          client_id: generateClientId(),
          message_type: 2,
          message_state: 2,
          item_list: [item],
          ...(contextToken ? { context_token: contextToken } : {}),
        },
        base_info: { channel_version: CHANNEL_VERSION },
      },
      token,
      baseUrl,
    );
  }
}

/**
 * Send a file attachment using a previously uploaded file.
 */
export async function sendFileMessage(
  to: string,
  uploaded: UploadedMedia,
  token: string,
  baseUrl: string,
  contextToken?: string,
  caption?: string,
) {
  const items: Array<{ type: number; text_item?: { text: string }; file_item?: unknown }> = [];
  if (caption) items.push({ type: 1, text_item: { text: caption } });
  items.push({
    type: 4,
    file_item: {
      media: {
        encrypt_query_param: uploaded.downloadEncryptedQueryParam,
        aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
        encrypt_type: 1,
      },
      file_name: uploaded.fileName ?? "file",
      len: String(uploaded.fileSize),
    },
  });

  for (const item of items) {
    await weixinRequest(
      "ilink/bot/sendmessage",
      {
        msg: {
          from_user_id: "",
          to_user_id: to,
          client_id: generateClientId(),
          message_type: 2,
          message_state: 2,
          item_list: [item],
          ...(contextToken ? { context_token: contextToken } : {}),
        },
        base_info: { channel_version: CHANNEL_VERSION },
      },
      token,
      baseUrl,
    );
  }
}

/**
 * Send a video message using a previously uploaded file.
 */
export async function sendVideoMessage(
  to: string,
  uploaded: UploadedMedia,
  token: string,
  baseUrl: string,
  contextToken?: string,
  caption?: string,
) {
  const items: Array<{ type: number; text_item?: { text: string }; video_item?: unknown }> = [];
  if (caption) items.push({ type: 1, text_item: { text: caption } });
  items.push({
    type: 5,
    video_item: {
      media: {
        encrypt_query_param: uploaded.downloadEncryptedQueryParam,
        aes_key: Buffer.from(uploaded.aeskey).toString("base64"),
        encrypt_type: 1,
      },
      video_size: uploaded.fileSizeCiphertext,
    },
  });

  for (const item of items) {
    await weixinRequest(
      "ilink/bot/sendmessage",
      {
        msg: {
          from_user_id: "",
          to_user_id: to,
          client_id: generateClientId(),
          message_type: 2,
          message_state: 2,
          item_list: [item],
          ...(contextToken ? { context_token: contextToken } : {}),
        },
        base_info: { channel_version: CHANNEL_VERSION },
      },
      token,
      baseUrl,
    );
  }
}
