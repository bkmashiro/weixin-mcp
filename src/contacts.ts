/**
 * Contact book — tracks users who have messaged the bot.
 * Stored in: ~/.weixin-mcp/contacts.json (or OpenClaw state dir equivalent)
 */

import fs from "node:fs";
import path from "node:path";
import { ACCOUNTS_DIR } from "./paths.js";

export interface Contact {
  userId: string;
  lastSeen: string;       // ISO timestamp
  lastText?: string;      // last message snippet
  contextToken?: string;  // latest context_token for replies
  msgCount: number;
}

export type ContactBook = Record<string, Contact>;

function contactsPath(): string {
  return path.join(path.dirname(ACCOUNTS_DIR), "contacts.json");
}

export function loadContacts(): ContactBook {
  try {
    return JSON.parse(fs.readFileSync(contactsPath(), "utf-8")) as ContactBook;
  } catch {
    return {};
  }
}

export function saveContacts(contacts: ContactBook): void {
  try {
    fs.mkdirSync(path.dirname(contactsPath()), { recursive: true });
    fs.writeFileSync(contactsPath(), JSON.stringify(contacts, null, 2));
  } catch {
    // non-fatal
  }
}

export function updateContactsFromMsgs(msgs: unknown[]): ContactBook {
  const contacts = loadContacts();
  for (const msg of msgs) {
    const m = msg as Record<string, unknown>;
    const from = String(m.from_user_id ?? "");
    if (!from || from.includes("@im.bot")) continue; // skip bot's own messages

    const text = (m.item_list as Array<{ type: number; text_item?: { text: string } }>)
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
