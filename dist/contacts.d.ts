/**
 * Contact book — tracks users who have messaged the bot.
 * Stored in: ~/.weixin-mcp/contacts.json (or OpenClaw state dir equivalent)
 */
export interface Contact {
    userId: string;
    lastSeen: string;
    lastText?: string;
    contextToken?: string;
    msgCount: number;
}
export type ContactBook = Record<string, Contact>;
export declare function loadContacts(): ContactBook;
export declare function saveContacts(contacts: ContactBook): void;
export declare function updateContactsFromMsgs(msgs: unknown[]): ContactBook;
