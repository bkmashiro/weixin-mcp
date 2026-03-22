/**
 * CLI messaging commands:
 *   npx weixin-mcp send <userId> <text>   — send a message
 *   npx weixin-mcp poll [--watch] [--reset] — poll for messages (once or continuous)
 */
import fs from "node:fs";
import path from "node:path";
import { ACCOUNTS_DIR } from "./paths.js";
import { DEFAULT_BASE_URL, sendTextMessage, sendMediaMessage, getUpdates, loadCursor, saveCursor, } from "./api.js";
import { uploadMedia } from "./cdn.js";
import { updateContactsFromMsgs, loadContacts } from "./contacts.js";
/** Resolve a short/partial userId to a full one from contacts. */
function resolveUserId(input) {
    if (!input)
        return input;
    // Already looks like a full id? return as-is
    if (input.includes("@"))
        return input;
    const contacts = Object.keys(loadContacts());
    const matches = contacts.filter((id) => id.startsWith(input) || id.includes(input));
    if (matches.length === 1)
        return matches[0];
    if (matches.length > 1) {
        console.error(`Ambiguous user "${input}", matches:\n${matches.map((m) => `  ${m}`).join("\n")}`);
        process.exit(1);
    }
    // Not found in contacts — treat as literal
    return input;
}
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
function parseCliSendArgs(args) {
    const opts = { to: "" };
    let i = 0;
    // First arg is always <to>
    if (args[i] && !args[i].startsWith("--")) {
        opts.to = args[i++];
    }
    while (i < args.length) {
        const arg = args[i];
        if (arg === "--image" && args[i + 1]) {
            opts.image = args[++i];
        }
        else if (arg === "--file" && args[i + 1]) {
            opts.file = args[++i];
        }
        else if (arg === "--video" && args[i + 1]) {
            opts.video = args[++i];
        }
        else if (arg === "--caption" && args[i + 1]) {
            opts.caption = args[++i];
        }
        else if (!arg.startsWith("--")) {
            // Collect remaining as text
            opts.text = args.slice(i).join(" ");
            break;
        }
        i++;
    }
    return opts;
}
export async function cliSend(args) {
    const opts = parseCliSendArgs(args);
    if (!opts.to) {
        console.error(`Usage: npx weixin-mcp send <userId> <text>
       npx weixin-mcp send <userId> --image <path> [--caption <text>]
       npx weixin-mcp send <userId> --file <path> [--caption <text>]
       npx weixin-mcp send <userId> --video <path> [--caption <text>]`);
        process.exit(1);
    }
    const resolvedTo = resolveUserId(opts.to);
    if (resolvedTo !== opts.to)
        console.log(`Resolved "${opts.to}" → ${resolvedTo}`);
    const { token, baseUrl = DEFAULT_BASE_URL } = loadAccount();
    // Get contextToken from contacts (required for sending)
    const contacts = loadContacts();
    const contextToken = contacts[resolvedTo]?.contextToken;
    // Determine what to send
    const mediaPath = opts.image || opts.file || opts.video;
    const mediaType = opts.image ? "image" : opts.file ? "file" : opts.video ? "video" : null;
    if (mediaPath && mediaType) {
        // Check file exists
        if (!fs.existsSync(mediaPath)) {
            console.error(`File not found: ${mediaPath}`);
            process.exit(1);
        }
        process.stdout.write(`Uploading ${mediaType}... `);
        const uploaded = await uploadMedia({
            source: mediaPath,
            mediaType,
            toUserId: resolvedTo,
            token: token,
            baseUrl,
        });
        console.log("✅");
        process.stdout.write(`Sending ${mediaType} to ${resolvedTo}... `);
        await sendMediaMessage({
            to: resolvedTo,
            mediaType,
            uploaded,
            caption: opts.caption,
            token: token,
            baseUrl,
            contextToken,
        });
        console.log("✅ Sent");
    }
    else if (opts.text) {
        // Text message
        process.stdout.write(`Sending to ${resolvedTo}... `);
        const result = await sendTextMessage(resolvedTo, opts.text, token, baseUrl, contextToken);
        const ret = result?.ret ?? result?.errcode;
        if (ret === 0 || ret === undefined) {
            console.log("✅ Sent");
        }
        else {
            console.log(`❌ Failed (ret=${ret})`);
            console.log(JSON.stringify(result, null, 2));
        }
    }
    else {
        console.error("Nothing to send. Provide text or --image/--file/--video");
        process.exit(1);
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
                    updateContactsFromMsgs(resp.msgs);
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
        if (resp.msgs && resp.msgs.length > 0)
            updateContactsFromMsgs(resp.msgs);
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
