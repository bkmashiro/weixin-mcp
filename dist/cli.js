#!/usr/bin/env node
/**
 * weixin-mcp CLI entry point
 *
 * Usage:
 *   npx weixin-mcp           — start MCP server (stdio)
 *   npx weixin-mcp login     — QR code login
 *   npx weixin-mcp status    — show current account status
 */
const command = process.argv[2];
if (command === "login") {
    // Run the login flow
    const { main } = await import("./login.js");
    await main();
}
else if (command === "status") {
    const { showStatus } = await import("./status.js");
    await showStatus();
}
else if (command === undefined || command === "serve" || command === "start") {
    // Default: start MCP server
    await import("./index.js");
}
else {
    console.error(`Unknown command: ${command}`);
    console.error(`Usage:
  npx weixin-mcp           Start MCP server
  npx weixin-mcp login     QR code login
  npx weixin-mcp status    Show current account status`);
    process.exit(1);
}
export {};
