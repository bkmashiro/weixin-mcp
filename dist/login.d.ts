#!/usr/bin/env node
/**
 * weixin-login — standalone QR login for weixin-mcp
 * Usage: node dist/login.js
 *
 * Fetches a QR code from Weixin API, renders it in terminal,
 * polls for scan confirmation, then saves token to:
 *   ~/.openclaw/openclaw-weixin/accounts/<accountId>.json
 */
export declare function main(): Promise<void>;
