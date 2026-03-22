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

if (command === "login") {
  const { main } = await import("./login.js");
  await main();

} else if (command === "status") {
  const { showStatus } = await import("./status.js");
  await showStatus();

} else if (command === "start") {
  const portArg = process.argv.indexOf("--port");
  const port = portArg !== -1 ? Number(process.argv[portArg + 1]) : undefined;
  const { startDaemon } = await import("./daemon.js");
  await startDaemon(port);

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

} else if (command === undefined || command === "serve") {
  // Default: stdio MCP server (for Claude Desktop integration)
  await import("./index.js");

} else {
  console.error(`Unknown command: ${command}`);
  console.error(`
Usage: npx weixin-mcp [command]

Commands:
  (no args)          Start stdio MCP server (Claude Desktop mode)
  login              QR code login
  status             Show account and daemon status
  start [--port n]   Start HTTP MCP daemon in background (default port: 3001)
  stop               Stop daemon
  restart            Restart daemon
  logs [-f]          Show daemon logs (-f to follow)
`);
  process.exit(1);
}
