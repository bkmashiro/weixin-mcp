#!/usr/bin/env node
// weixin-login — shorthand for: npx weixin-mcp login
import { main } from "./login.js";
main().catch((err) => { console.error(err); process.exit(1); });
