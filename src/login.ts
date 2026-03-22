#!/usr/bin/env node
/**
 * weixin-login — QR login for weixin-mcp
 * Usage: npx weixin-mcp login
 *
 * Token saved to: ~/.weixin-mcp/accounts/ (or ~/.openclaw/openclaw-weixin/accounts/ if OpenClaw is installed)
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
// @ts-ignore — no types for qrcode-terminal
import qrcode from "qrcode-terminal";
import { ACCOUNTS_DIR } from "./paths.js";

const BASE_URL = "https://ilinkai.weixin.qq.com";
const BOT_TYPE = "3";

async function fetchQRCode(): Promise<{ qrcode: string; qrcode_img_content: string }> {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = `${base}ilink/bot/get_bot_qrcode?bot_type=${BOT_TYPE}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`QR fetch failed: ${res.status}`);
  return res.json() as Promise<{ qrcode: string; qrcode_img_content: string }>;
}

async function pollStatus(qrcodeVal: string): Promise<{
  status: "wait" | "scaned" | "confirmed" | "expired";
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
}> {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = `${base}ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcodeVal)}`;
  const res = await fetch(url, {
    headers: { "iLink-App-ClientVersion": "1" },
  });
  if (!res.ok) throw new Error(`Status poll failed: ${res.status}`);
  return res.json() as Promise<{
    status: "wait" | "scaned" | "confirmed" | "expired";
    bot_token?: string;
    ilink_bot_id?: string;
    baseurl?: string;
    ilink_user_id?: string;
  }>;
}

/** Find existing account file by userId (same WeChat user → same account) */
function findAccountByUserId(userId: string): string | null {
  if (!fs.existsSync(ACCOUNTS_DIR)) return null;
  const files = fs.readdirSync(ACCOUNTS_DIR).filter(
    (f) => f.endsWith(".json") && !f.includes("sync") && !f.includes("cursor"),
  );
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(ACCOUNTS_DIR, file), "utf-8"));
      if (data.userId === userId) {
        return file.replace(".json", "");
      }
    } catch {}
  }
  return null;
}

function saveAccount(accountId: string, token: string, baseUrl: string, userId?: string) {
  fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
  
  // If userId provided, check for existing account with same userId
  let finalAccountId = accountId;
  if (userId) {
    const existingId = findAccountByUserId(userId);
    if (existingId && existingId !== accountId) {
      console.log(`\n🔄 Updating existing account: ${existingId}`);
      finalAccountId = existingId;
    }
  }
  
  const filePath = path.join(ACCOUNTS_DIR, `${finalAccountId}.json`);
  const existing = fs.existsSync(filePath)
    ? (JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>)
    : {};
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        ...existing,
        token,
        baseUrl,
        ...(userId ? { userId } : {}),
        savedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`\n✅ Token saved to: ${filePath}`);
}

export async function main() {
  console.log("🔐 WeChat MCP — QR Login\n");

  console.log("Fetching QR code...");
  const { qrcode: qrcodeToken, qrcode_img_content: qrcodeUrl } = await fetchQRCode();

  // qrcode_img_content is the WeChat URL to scan
  // qrcode is just the token used for polling status — do NOT render this as QR
  console.log("\nScan this QR code with WeChat:\n");
  qrcode.generate(qrcodeUrl, { small: true });

  console.log("\nWaiting for scan...");

  // Poll using qrcodeToken (not the URL)
  let attempts = 0;
  let qrRefreshCount = 0;
  let currentQrcodeToken = qrcodeToken;
  let currentQrcodeUrl = qrcodeUrl;

  while (attempts < 90) {
    await new Promise((r) => setTimeout(r, 2000));
    attempts++;

    const status = await pollStatus(currentQrcodeToken);

    if (status.status === "scaned") {
      process.stdout.write("\r✓ Scanned! Waiting for confirmation...");
    } else if (status.status === "confirmed") {
      const token = status.bot_token;
      if (!token) throw new Error("No token in confirmed response");
      const baseUrl = status.baseurl ?? BASE_URL;
      const userId = status.ilink_user_id ?? status.ilink_bot_id;
      // Use bot_id or a random ID as account identifier
      const accountId = status.ilink_bot_id?.replace("@", "-").replace(".", "-")
        ?? crypto.randomBytes(6).toString("hex") + "-im-bot";
      // userId from API already contains @im.wechat suffix — don't append again
      saveAccount(accountId, token, baseUrl, userId ?? undefined);
      console.log(`\n🎉 Logged in! Account: ${accountId}`);
      console.log(`   UserId: ${userId ?? "(unknown)"}`);
      console.log("\nYou can now start the MCP server:");
      console.log("  node dist/index.js\n");
      process.exit(0);
    } else if (status.status === "expired") {
      qrRefreshCount++;
      if (qrRefreshCount > 3) {
        console.error("\n❌ QR code expired 3 times. Please run again.");
        process.exit(1);
      }
      console.log(`\n⏳ QR code expired, refreshing... (${qrRefreshCount}/3)`);
      const refreshed = await fetchQRCode();
      currentQrcodeToken = refreshed.qrcode;
      currentQrcodeUrl = refreshed.qrcode_img_content;
      console.log("\nNew QR code — scan with WeChat:\n");
      qrcode.generate(currentQrcodeUrl, { small: true });
    }
  }

  console.error("\n❌ Timeout waiting for scan.");
  process.exit(1);
}

// Run directly if invoked as script (not imported as module)
if (process.argv[1]?.endsWith("login.js")) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}
