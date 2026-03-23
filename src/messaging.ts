/**
 * CLI messaging commands:
 *   npx weixin-mcp send <userId> <text>   — send a message
 *   npx weixin-mcp poll [--watch] [--reset] — poll for messages (once or continuous)
 */

import fs from "node:fs";
import path from "node:path";
import { ACCOUNTS_DIR } from "./paths.js";
import {
  DEFAULT_BASE_URL,
  sendTextMessage,
  sendMediaMessage,
  getUpdates,
  loadCursor,
  saveCursor,
} from "./api.js";
import { uploadMedia, downloadMedia, downloadMediaToFile, type MediaType, type DownloadParams } from "./cdn.js";
import { updateContactsFromMsgs, loadContacts } from "./contacts.js";

/** Resolve a short/partial userId to a full one from contacts. */
function resolveUserId(input: string): string {
  if (!input) return input;
  // Already looks like a full id? return as-is
  if (input.includes("@")) return input;
  const contacts = Object.keys(loadContacts());
  const matches = contacts.filter((id) => id.startsWith(input) || id.includes(input));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    console.error(`Ambiguous user "${input}", matches:\n${matches.map((m) => `  ${m}`).join("\n")}`);
    process.exit(1);
  }
  // Not found in contacts — treat as literal
  return input;
}

interface AccountData { token?: string; baseUrl?: string; userId?: string }

function loadAccount(): AccountData & { accountId: string } {
  const files = fs.readdirSync(ACCOUNTS_DIR).filter(
    (f) => f.endsWith(".json") && !f.endsWith(".sync.json") && !f.endsWith(".cursor.json"),
  );
  if (files.length === 0) throw new Error("No account. Run: npx weixin-mcp login");
  const accountId = process.env.WEIXIN_ACCOUNT_ID ?? files[0].replace(".json", "");
  const data = JSON.parse(fs.readFileSync(path.join(ACCOUNTS_DIR, `${accountId}.json`), "utf-8")) as AccountData;
  if (!data.token) throw new Error(`No token for ${accountId}. Run: npx weixin-mcp login`);
  return { ...data, accountId };
}

interface MediaItem {
  media?: { encrypt_query_param?: string };
  aeskey?: string;
  url?: string;
}

function formatMsg(msg: Record<string, unknown>): string {
  const from = String(msg.from_user_id ?? "?");
  const items = (msg.item_list as Array<{ 
    type: number; 
    text_item?: { text: string }; 
    image_item?: MediaItem;
    file_item?: MediaItem & { file_name?: string };
    video_item?: MediaItem;
  }>) ?? [];
  const parts: string[] = [];
  for (const item of items) {
    if (item.type === 1 && item.text_item?.text) {
      parts.push(item.text_item.text);
    } else if (item.type === 2 && item.image_item) {
      // Image
      const img = item.image_item;
      if (img.url) {
        parts.push(`[image: ${img.url}]`);
      } else if (img.media?.encrypt_query_param && img.aeskey) {
        parts.push(`[image: encrypted | param=${img.media.encrypt_query_param.slice(0, 30)}... | key=${img.aeskey}]`);
      } else {
        parts.push(`[image: unknown format]`);
      }
    } else if (item.type === 4 && item.file_item) {
      // File
      const file = item.file_item;
      const name = file.file_name ?? "file";
      if (file.media?.encrypt_query_param && file.aeskey) {
        parts.push(`[file: ${name} | param=${file.media.encrypt_query_param.slice(0, 30)}... | key=${file.aeskey}]`);
      } else {
        parts.push(`[file: ${name}]`);
      }
    } else if (item.type === 5 && item.video_item) {
      // Video
      const vid = item.video_item;
      if (vid.media?.encrypt_query_param && vid.aeskey) {
        parts.push(`[video: encrypted | param=${vid.media.encrypt_query_param.slice(0, 30)}... | key=${vid.aeskey}]`);
      } else {
        parts.push(`[video]`);
      }
    } else {
      parts.push(`[type:${item.type}]`);
    }
  }
  const msgType = Number(msg.message_type);
  const prefix = msgType === 1 ? "← " : "→ "; // incoming vs outgoing
  return `${prefix}${from.slice(0, 20)}: ${parts.join(" ") || "(empty)"}`;
}

interface SendOptions {
  to: string;
  text?: string;
  image?: string;
  file?: string;
  video?: string;
  caption?: string;
}

function parseCliSendArgs(args: string[]): SendOptions {
  const opts: SendOptions = { to: "" };
  let i = 0;
  
  // First arg is always <to>
  if (args[i] && !args[i].startsWith("--")) {
    opts.to = args[i++];
  }
  
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--image" && args[i + 1]) {
      opts.image = args[++i];
    } else if (arg === "--file" && args[i + 1]) {
      opts.file = args[++i];
    } else if (arg === "--video" && args[i + 1]) {
      opts.video = args[++i];
    } else if (arg === "--caption" && args[i + 1]) {
      opts.caption = args[++i];
    } else if (!arg.startsWith("--")) {
      // Collect remaining as text
      opts.text = args.slice(i).join(" ");
      break;
    }
    i++;
  }
  return opts;
}

export async function cliSend(args: string[]) {
  const opts = parseCliSendArgs(args);
  
  if (!opts.to) {
    console.error(`Usage: npx weixin-mcp send <userId> <text>
       npx weixin-mcp send <userId> --image <path> [--caption <text>]
       npx weixin-mcp send <userId> --file <path> [--caption <text>]
       npx weixin-mcp send <userId> --video <path> [--caption <text>]`);
    process.exit(1);
  }
  
  const resolvedTo = resolveUserId(opts.to);
  if (resolvedTo !== opts.to) console.log(`Resolved "${opts.to}" → ${resolvedTo}`);
  const { token, baseUrl = DEFAULT_BASE_URL } = loadAccount();
  
  // Get contextToken from contacts (required for sending)
  const contacts = loadContacts();
  const contextToken = contacts[resolvedTo]?.contextToken;
  
  // Determine what to send
  const mediaPath = opts.image || opts.file || opts.video;
  const mediaType: MediaType | null = opts.image ? "image" : opts.file ? "file" : opts.video ? "video" : null;
  
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
      token: token!,
      baseUrl,
    });
    console.log("✅");
    
    process.stdout.write(`Sending ${mediaType} to ${resolvedTo}... `);
    await sendMediaMessage({
      to: resolvedTo,
      mediaType,
      uploaded,
      caption: opts.caption,
      token: token!,
      baseUrl,
      contextToken,
    });
    console.log("✅ Sent");
  } else if (opts.text) {
    // Text message
    process.stdout.write(`Sending to ${resolvedTo}... `);
    const result = await sendTextMessage(resolvedTo, opts.text, token!, baseUrl, contextToken) as Record<string, unknown>;
    const ret = result?.ret ?? result?.errcode;
    if (ret === 0 || ret === undefined) {
      console.log("✅ Sent");
    } else {
      console.log(`❌ Failed (ret=${ret})`);
      console.log(JSON.stringify(result, null, 2));
    }
  } else {
    console.error("Nothing to send. Provide text or --image/--file/--video");
    process.exit(1);
  }
}

/**
 * Download media from a received message.
 * Usage: npx weixin-mcp download --encrypt-param <param> --aes-key <key> -o <output>
 */
export async function cliDownload(args: string[]) {
  let encryptParam = "";
  let aesKey = "";
  let outputPath = "";
  
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--encrypt-param" || args[i] === "-e") && args[i + 1]) {
      encryptParam = args[++i];
    } else if ((args[i] === "--aes-key" || args[i] === "-k") && args[i + 1]) {
      aesKey = args[++i];
    } else if ((args[i] === "-o" || args[i] === "--output") && args[i + 1]) {
      outputPath = args[++i];
    }
  }
  
  if (!encryptParam || !aesKey) {
    console.error(`Usage: npx weixin-mcp download --encrypt-param <param> --aes-key <key> [-o <output>]

Extract these values from a received message:
  - encrypt_query_param: from image_item.media.encrypt_query_param or file_item.media.encrypt_query_param
  - aes_key: from image_item.aeskey or file_item's aes_key (hex string)`);
    process.exit(1);
  }
  
  try {
    process.stdout.write("Downloading... ");
    
    if (outputPath) {
      await downloadMediaToFile({ encryptQueryParam: encryptParam, aesKey }, outputPath);
      console.log(`✅ Saved to ${outputPath}`);
    } else {
      // Output to stdout as base64
      const data = await downloadMedia({ encryptQueryParam: encryptParam, aesKey });
      console.log("✅");
      console.log(`Size: ${data.length} bytes`);
      console.log(`Base64: ${data.toString("base64").slice(0, 100)}...`);
    }
  } catch (err) {
    console.log("❌");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export async function cliPoll(args: string[]) {
  const watch = args.includes("--watch") || args.includes("-w");
  const reset = args.includes("--reset");

  const { token, baseUrl = DEFAULT_BASE_URL, accountId } = loadAccount();

  if (watch) {
    console.log("Watching for messages (Ctrl+C to stop)...\n");
    let cursor = reset ? "" : loadCursor(accountId);

    while (true) {
      try {
        const resp = await getUpdates(token!, baseUrl, cursor);
        if (resp.get_updates_buf) {
          cursor = resp.get_updates_buf;
          saveCursor(accountId, cursor);
        }
        if (resp.msgs && resp.msgs.length > 0) {
          updateContactsFromMsgs(resp.msgs as unknown[]);
          const ts = new Date().toLocaleTimeString();
          for (const msg of resp.msgs) {
            console.log(`[${ts}] ${formatMsg(msg as Record<string, unknown>)}`);
          }
        }
      } catch (err) {
        console.error("Poll error:", err instanceof Error ? err.message : String(err));
        await new Promise((r) => setTimeout(r, 3000));
      }
      // getupdates is long-poll, no need for extra delay
    }
  } else {
    // One-shot poll
    const cursor = reset ? "" : loadCursor(accountId);
    const resp = await getUpdates(token!, baseUrl, cursor);
    if (resp.get_updates_buf) saveCursor(accountId, resp.get_updates_buf);
    if (resp.msgs && resp.msgs.length > 0) updateContactsFromMsgs(resp.msgs as unknown[]);

    const msgs = resp.msgs ?? [];
    if (msgs.length === 0) {
      console.log("No new messages.");
    } else {
      console.log(`${msgs.length} message(s):\n`);
      for (const msg of msgs) {
        console.log(formatMsg(msg as Record<string, unknown>));
      }
    }
  }
}
