/**
 * CLI messaging commands:
 *   npx weixin-mcp send <userId> <text>   — send a message
 *   npx weixin-mcp poll [--watch] [--reset] — poll for messages (once or continuous)
 */
import fs from "node:fs";
import path from "node:path";
import { ACCOUNTS_DIR } from "./paths.js";
import { DEFAULT_BASE_URL, sendTextMessage, getUpdates, loadCursor, saveCursor, } from "./api.js";
function loadAccount() {
    const files = fs.readdirSync(ACCOUNTS_DIR).filter((f) => f.endsWith(".json") && !f.endsWith(".sync.json") && !f.endsWith(".cursor.json"));
    if (files.length === 0)
        throw new Error("No account. Run: npx weixin-mcp login");
    const accountId = process.env.WEIXIN_ACCOUNT_ID ?? files[0].replace(".json", "");
    const data = JSON.parse(fs.readFileSync(path.join(ACCOUNTS_DIR, `${accountId}.json`), "utf-8"));
    if (!data.token)
        throw new Error(`No token for ${accountId}. Run: npx weixin-mcp login`);
    return { ...data, accountId };
}
function formatMsg(msg) {
    const from = String(msg.from_user_id ?? "?");
    const items = msg.item_list ?? [];
    const parts = [];
    for (const item of items) {
        if (item.type === 1 && item.text_item?.text)
            parts.push(item.text_item.text);
        else if (item.type === 2 && item.image_item?.url)
            parts.push(`[image: ${item.image_item.url}]`);
        else
            parts.push(`[type:${item.type}]`);
    }
    const msgType = Number(msg.message_type);
    const prefix = msgType === 1 ? "← " : "→ "; // incoming vs outgoing
    return `${prefix}${from.slice(0, 20)}: ${parts.join(" ") || "(empty)"}`;
}
export async function cliSend(args) {
    const [to, ...textParts] = args;
    if (!to || textParts.length === 0) {
        console.error("Usage: npx weixin-mcp send <userId> <message text>");
        process.exit(1);
    }
    const text = textParts.join(" ");
    const { token, baseUrl = DEFAULT_BASE_URL } = loadAccount();
    process.stdout.write(`Sending to ${to}... `);
    const result = await sendTextMessage(to, text, token, baseUrl);
    const ret = result?.ret ?? result?.errcode;
    if (ret === 0 || ret === undefined) {
        console.log("✅ Sent");
    }
    else {
        console.log(`❌ Failed (ret=${ret})`);
        console.log(JSON.stringify(result, null, 2));
    }
}
export async function cliPoll(args) {
    const watch = args.includes("--watch") || args.includes("-w");
    const reset = args.includes("--reset");
    const { token, baseUrl = DEFAULT_BASE_URL, accountId } = loadAccount();
    if (watch) {
        console.log("Watching for messages (Ctrl+C to stop)...\n");
        let cursor = reset ? "" : loadCursor(accountId);
        while (true) {
            try {
                const resp = await getUpdates(token, baseUrl, cursor);
                if (resp.get_updates_buf) {
                    cursor = resp.get_updates_buf;
                    saveCursor(accountId, cursor);
                }
                if (resp.msgs && resp.msgs.length > 0) {
                    const ts = new Date().toLocaleTimeString();
                    for (const msg of resp.msgs) {
                        console.log(`[${ts}] ${formatMsg(msg)}`);
                    }
                }
            }
            catch (err) {
                console.error("Poll error:", err instanceof Error ? err.message : String(err));
                await new Promise((r) => setTimeout(r, 3000));
            }
            // getupdates is long-poll, no need for extra delay
        }
    }
    else {
        // One-shot poll
        const cursor = reset ? "" : loadCursor(accountId);
        const resp = await getUpdates(token, baseUrl, cursor);
        if (resp.get_updates_buf)
            saveCursor(accountId, resp.get_updates_buf);
        const msgs = resp.msgs ?? [];
        if (msgs.length === 0) {
            console.log("No new messages.");
        }
        else {
            console.log(`${msgs.length} message(s):\n`);
            for (const msg of msgs) {
                console.log(formatMsg(msg));
            }
        }
    }
}
