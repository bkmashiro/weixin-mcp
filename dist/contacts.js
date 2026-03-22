/**
 * Contact book — tracks users who have messaged the bot.
 * Stored in: ~/.weixin-mcp/contacts.json (or OpenClaw state dir equivalent)
 */
import fs from "node:fs";
import path from "node:path";
import { ACCOUNTS_DIR } from "./paths.js";
function contactsPath() {
    return path.join(path.dirname(ACCOUNTS_DIR), "contacts.json");
}
export function loadContacts() {
    try {
        return JSON.parse(fs.readFileSync(contactsPath(), "utf-8"));
    }
    catch {
        return {};
    }
}
export function saveContacts(contacts) {
    try {
        fs.mkdirSync(path.dirname(contactsPath()), { recursive: true });
        fs.writeFileSync(contactsPath(), JSON.stringify(contacts, null, 2));
    }
    catch {
        // non-fatal
    }
}
export function updateContactsFromMsgs(msgs) {
    const contacts = loadContacts();
    for (const msg of msgs) {
        const m = msg;
        const from = String(m.from_user_id ?? "");
        if (!from || from.includes("@im.bot"))
            continue; // skip bot's own messages
        const text = m.item_list
            ?.find((i) => i.type === 1)?.text_item?.text;
        const existing = contacts[from] ?? { userId: from, lastSeen: "", lastText: undefined, contextToken: undefined, msgCount: 0 };
        contacts[from] = {
            userId: from,
            lastSeen: new Date().toISOString(),
            lastText: text ? text.slice(0, 80) : existing.lastText,
            contextToken: String(m.context_token ?? existing.contextToken ?? ""),
            msgCount: existing.msgCount + 1,
        };
    }
    saveContacts(contacts);
    return contacts;
}
