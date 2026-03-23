#!/usr/bin/env node
/**
 * weixin-mcp CLI
 *
 * Commands:
 *   (no args)              Start MCP server in stdio mode (for Claude Desktop)
 *   login                  QR code login
 *   status                 Show account + daemon status
 *   start [--port <n>]     Start HTTP MCP daemon in background
 *   stop                   Stop daemon
 *   restart [--port <n>]   Restart daemon
 *   logs [-f]              Show daemon logs (tail -f with -f flag)
 */

const command = process.argv[2];

if (command === "--version" || command === "-v") {
  const { createRequire } = await import("node:module");
  const { fileURLToPath } = await import("node:url");
  const __filename = fileURLToPath(import.meta.url);
  const req = createRequire(__filename);
  const { version } = req("../package.json") as { version: string };
  console.log(`weixin-mcp v${version}`);
  process.exit(0);
}

if (command === "login") {
  const { main } = await import("./login.js");
  await main();

} else if (command === "status") {
  const { showStatus } = await import("./status.js");
  await showStatus();

} else if (command === "start") {
  const portArg = process.argv.indexOf("--port");
  const port = portArg !== -1 ? Number(process.argv[portArg + 1]) : undefined;
  const webhookArg = process.argv.indexOf("--webhook");
  const webhook = webhookArg !== -1 ? process.argv[webhookArg + 1] : undefined;
  const { startDaemon } = await import("./daemon.js");
  await startDaemon(port, webhook);

} else if (command === "stop") {
  const { stopDaemon } = await import("./daemon.js");
  stopDaemon();

} else if (command === "restart") {
  const portArg = process.argv.indexOf("--port");
  const port = portArg !== -1 ? Number(process.argv[portArg + 1]) : undefined;
  const { restartDaemon } = await import("./daemon.js");
  await restartDaemon(port);

} else if (command === "logs") {
  const follow = process.argv.includes("-f") || process.argv.includes("--follow");
  const { showLogs } = await import("./daemon.js");
  showLogs(follow);

} else if (command === "accounts") {
  const { manageAccounts } = await import("./accounts.js");
  await manageAccounts(process.argv.slice(3));

} else if (command === "update") {
  const { execSync } = await import("node:child_process");
  const { createRequire } = await import("node:module");
  const { fileURLToPath } = await import("node:url");
  const __filename = fileURLToPath(import.meta.url);
  const req = createRequire(__filename);
  const current = (req("../package.json") as { version: string }).version;

  process.stdout.write("Checking latest version... ");
  const res = await fetch("https://registry.npmjs.org/weixin-mcp/latest");
  const { version: latest } = await res.json() as { version: string };
  console.log(`current: ${current} → latest: ${latest}`);

  if (current === latest) {
    console.log("✅ Already up to date.");
  } else {
    console.log(`Updating weixin-mcp ${current} → ${latest}...`);
    execSync("npm install -g weixin-mcp@latest", { stdio: "inherit" });
    console.log("✅ Updated! Run: npx weixin-mcp --version");
  }

} else if (command === "contacts") {
  const { loadContacts } = await import("./contacts.js");
  const contacts = Object.values(loadContacts());
  if (contacts.length === 0) {
    console.log("No contacts yet. Run: npx weixin-mcp poll --reset");
  } else {
    console.log(`Contacts (${contacts.length}):\n`);
    for (const c of contacts) {
      console.log(`  ${c.userId}`);
      console.log(`    Last:  ${c.lastText ?? "(no text)"}`);
      console.log(`    Seen:  ${new Date(c.lastSeen).toLocaleString()}`);
      console.log(`    Msgs:  ${c.msgCount}`);
      if (c.contextToken) console.log(`    Token: ${c.contextToken.slice(0, 20)}...`);
    }
  }

} else if (command === "send") {
  const { cliSend } = await import("./messaging.js");
  await cliSend(process.argv.slice(3)); // <userId> <text...>

} else if (command === "poll") {
  const { cliPoll } = await import("./messaging.js");
  await cliPoll(process.argv.slice(3)); // [--watch] [--reset]

} else if (command === "download") {
  const { cliDownload } = await import("./messaging.js");
  await cliDownload(process.argv.slice(3));

} else if (command === undefined || command === "serve") {
  // Default: stdio MCP server (for Claude Desktop integration)
  await import("./index.js");

} else {
  console.error(`Unknown command: ${command}`);
  console.error(`
Usage: npx weixin-mcp [command]

Commands:
  (no args)                    Start stdio MCP server (Claude Desktop mode)
  login                        QR code login
  status                       Show account and daemon status
  start [--port n] [--webhook url]  Start HTTP daemon (with optional webhook push)
  stop                         Stop daemon
  restart                      Restart daemon
  logs [-f]                    Show daemon logs (-f to follow)
  contacts                     Show contact book (users who messaged the bot)
  update                       Check and install latest version
  --version / -v               Print version
  send <userId> <text>         Send a text message
  send <userId> --image <path> [--caption <text>]  Send an image
  send <userId> --file <path> [--caption <text>]   Send a file
  send <userId> --video <path> [--caption <text>]  Send a video
  poll [--watch|-w] [--reset]  Poll messages once, or watch continuously
  download --encrypt-param <p> --aes-key <k> [-o file]  Download media from message
  accounts [list]              List all accounts
  accounts remove <id>         Remove an account
  accounts clean               Remove duplicate accounts (same userId), keep newest
  accounts use <id>            Print export command for switching accounts
`);
  process.exit(1);
}
