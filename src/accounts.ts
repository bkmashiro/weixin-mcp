/**
 * Account management commands:
 *   npx weixin-mcp accounts list        — list all accounts (default)
 *   npx weixin-mcp accounts remove <id> — remove a specific account
 *   npx weixin-mcp accounts clean       — remove duplicate accounts (same userId), keep newest
 *   npx weixin-mcp accounts use <id>    — print export WEIXIN_ACCOUNT_ID=<id>
 */

import fs from "node:fs";
import path from "node:path";
import { ACCOUNTS_DIR } from "./paths.js";

interface AccountData {
  token?: string;
  baseUrl?: string;
  userId?: string;
  savedAt?: string;
}

function listFiles(): string[] {
  try {
    return fs
      .readdirSync(ACCOUNTS_DIR)
      .filter((f) => f.endsWith(".json") && !f.endsWith(".sync.json") && !f.endsWith(".cursor.json"));
  } catch {
    return [];
  }
}

function loadAccount(file: string): AccountData & { accountId: string } {
  const accountId = file.replace(".json", "");
  const data = JSON.parse(fs.readFileSync(path.join(ACCOUNTS_DIR, file), "utf-8")) as AccountData;
  return { ...data, accountId };
}

function removeAccount(accountId: string) {
  const filePath = path.join(ACCOUNTS_DIR, `${accountId}.json`);
  const cursorPath = path.join(ACCOUNTS_DIR, `${accountId}.cursor.json`);
  let removed = false;
  if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); removed = true; }
  if (fs.existsSync(cursorPath)) { fs.unlinkSync(cursorPath); }
  return removed;
}

export async function manageAccounts(args: string[]) {
  const subcommand = args[0] ?? "list";

  if (subcommand === "list") {
    const files = listFiles();
    if (files.length === 0) {
      console.log("No accounts found. Run: npx weixin-mcp login");
      return;
    }
    const active = process.env.WEIXIN_ACCOUNT_ID ?? files[0].replace(".json", "");
    console.log(`Accounts (${files.length}):\n`);
    for (const file of files) {
      const acc = loadAccount(file);
      const isActive = acc.accountId === active;
      const savedAt = acc.savedAt ? new Date(acc.savedAt).toLocaleString() : "unknown";
      console.log(`${isActive ? "● " : "  "}${acc.accountId}`);
      const displayId = acc.userId?.replace(/@im\.wechat(@im\.wechat)+$/, "@im.wechat") ?? "(unknown)";
      console.log(`    User:  ${displayId}`);
      console.log(`    Saved: ${savedAt}`);
    }
    if (files.length > 1) {
      console.log(`\nActive: ${active} (set WEIXIN_ACCOUNT_ID to change)`);
    }

  } else if (subcommand === "remove") {
    const accountId = args[1];
    if (!accountId) { console.error("Usage: accounts remove <accountId>"); process.exit(1); }
    if (removeAccount(accountId)) {
      console.log(`✅ Removed: ${accountId}`);
    } else {
      console.error(`❌ Account not found: ${accountId}`);
      process.exit(1);
    }

  } else if (subcommand === "clean") {
    const files = listFiles();
    const byUserId = new Map<string, Array<AccountData & { accountId: string }>>();

    for (const file of files) {
      const acc = loadAccount(file);
      // Normalize userId: strip duplicate @im.wechat suffix
      const rawId = acc.userId ?? acc.accountId;
      const key = rawId.replace(/@im\.wechat(@im\.wechat)+$/, "@im.wechat");
      if (!byUserId.has(key)) byUserId.set(key, []);
      byUserId.get(key)!.push(acc);
    }

    let removed = 0;
    for (const [userId, accounts] of byUserId) {
      if (accounts.length <= 1) continue;
      // Sort by savedAt desc — keep newest
      accounts.sort((a, b) => {
        const ta = a.savedAt ? new Date(a.savedAt).getTime() : 0;
        const tb = b.savedAt ? new Date(b.savedAt).getTime() : 0;
        return tb - ta;
      });
      const [keep, ...remove] = accounts;
      console.log(`UserId: ${userId}`);
      console.log(`  ✓ Keep:   ${keep.accountId} (${keep.savedAt ?? "?"})`);
      for (const acc of remove) {
        removeAccount(acc.accountId);
        console.log(`  ✗ Removed: ${acc.accountId} (${acc.savedAt ?? "?"})`);
        removed++;
      }
    }

    if (removed === 0) {
      console.log("✅ No duplicates found.");
    } else {
      console.log(`\n✅ Cleaned ${removed} duplicate account(s).`);
    }

  } else if (subcommand === "use") {
    const accountId = args[1];
    if (!accountId) { console.error("Usage: accounts use <accountId>"); process.exit(1); }
    const filePath = path.join(ACCOUNTS_DIR, `${accountId}.json`);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Account not found: ${accountId}`);
      process.exit(1);
    }
    console.log(`export WEIXIN_ACCOUNT_ID="${accountId}"`);

  } else {
    console.error(`Unknown accounts subcommand: ${subcommand}`);
    console.error("Usage: accounts [list|remove <id>|clean|use <id>]");
    process.exit(1);
  }
}
