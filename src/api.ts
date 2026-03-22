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
  constructor(message: string) {
    super(message);
    this.name = "WeixinNetworkError";
  }
}

export function generateClientId(): string {
  return `openclaw-weixin-mcp-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

async function parseErrorResponse(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.trim() || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

function isTransientNetworkError(error: unknown): boolean {
  return error instanceof TypeError || error instanceof WeixinNetworkError;
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
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(bodyStr, "utf-8")),
          "AuthorizationType": "ilink_bot_token",
          "Authorization": `Bearer ${token}`,
        },
        body: bodyStr,
      });

      if (AUTH_ERROR_STATUSES.has(res.status)) {
        throw new WeixinAuthError();
      }

      if (!res.ok) {
        const message = await parseErrorResponse(res);
        throw new Error(`Weixin API error ${res.status}: ${message}`);
      }

      return res.json();
    } catch (error) {
      if (error instanceof WeixinAuthError) {
        throw error;
      }

      if (isTransientNetworkError(error) && attempt < retries) {
        continue;
      }

      if (isTransientNetworkError(error)) {
        throw new WeixinNetworkError(
          error instanceof Error ? error.message : "Network request failed",
        );
      }

      throw error;
    }
  }

  throw new WeixinNetworkError("Network request failed");
}

/** Send a text message. Uses real endpoint: ilink/bot/sendmessage */
export async function sendTextMessage(to: string, text: string, token: string, baseUrl: string) {
  return weixinRequest(
    "ilink/bot/sendmessage",
    {
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: generateClientId(),
        message_type: 2,   // BOT
        message_state: 2,  // FINISH
        item_list: [{ type: 1, text_item: { text } }],
      },
      base_info: { channel_version: "1.0.1" },
    },
    token,
    baseUrl,
  );
}

/** Long-poll for new messages. Uses real endpoint: ilink/bot/getupdates */
export async function pollMessages(token: string, baseUrl: string, timeoutMs = 5000) {
  return weixinRequest(
    "ilink/bot/getupdates",
    {
      timeout_ms: timeoutMs,
      base_info: { channel_version: "1.0.1" },
    },
    token,
    baseUrl,
  );
}

/** Get bot config for a user (includes context_token for replies). */
export async function getConfig(ilinkUserId: string, token: string, baseUrl: string) {
  return weixinRequest(
    "ilink/bot/getconfig",
    {
      ilink_user_id: ilinkUserId,
      base_info: { channel_version: "1.0.1" },
    },
    token,
    baseUrl,
  );
}

// Note: WeChat bot API does not have a standalone contacts/history endpoint.
// Contacts are tracked from incoming messages (getupdates).
// Keeping a stub for MCP compatibility:
export async function getContacts(_token: string, _baseUrl: string) {
  return { note: "WeChat bot API does not support listing contacts. Use weixin_poll_messages to receive incoming messages and track senders." };
}
