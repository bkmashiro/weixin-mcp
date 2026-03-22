import fs from "node:fs";
import path from "node:path";
import { ACCOUNTS_DIR } from "./paths.js";

export async function showStatus() {
  console.log("🔍 weixin-mcp status\n");

  let files: string[];
  try {
    files = fs.readdirSync(ACCOUNTS_DIR).filter(
      (f) => f.endsWith(".json") && !f.endsWith(".sync.json") && !f.endsWith(".cursor.json"),
    );
  } catch {
    console.log("❌ No accounts directory found.");
    console.log(`   Expected: ${ACCOUNTS_DIR}`);
    console.log("\nRun: npx weixin-mcp login");
    return;
  }

  if (files.length === 0) {
    console.log("❌ No accounts found.");
    console.log("\nRun: npx weixin-mcp login");
    return;
  }

  for (const file of files) {
    const accountId = file.replace(".json", "");
    const filePath = path.join(ACCOUNTS_DIR, file);
    const cursorPath = path.join(ACCOUNTS_DIR, `${accountId}.cursor.json`);

    let data: { token?: string; baseUrl?: string; userId?: string; savedAt?: string } = {};
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      console.log(`⚠️  ${accountId}: failed to read account file`);
      continue;
    }

    const hasToken = !!data.token?.trim();
    const hasCursor = fs.existsSync(cursorPath);
    const savedAt = data.savedAt ? new Date(data.savedAt).toLocaleString() : "unknown";

    console.log(`${hasToken ? "✅" : "❌"} Account: ${accountId}`);
    console.log(`   User ID:   ${data.userId ?? "(unknown)"}`);
    console.log(`   Base URL:  ${data.baseUrl ?? "(default)"}`);
    console.log(`   Token:     ${hasToken ? `${data.token!.slice(0, 12)}... (saved ${savedAt})` : "missing"}`);
    console.log(`   Cursor:    ${hasCursor ? "✓ present" : "not yet (first poll will create)"}`);
    console.log();
  }

  if (files.length > 1) {
    const active = process.env.WEIXIN_ACCOUNT_ID ?? files[0].replace(".json", "");
    console.log(`Active account (WEIXIN_ACCOUNT_ID): ${active}`);
  }
}
