import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { sendTextMessage, sendImageMessage, sendFileMessage, sendVideoMessage } from "../dist/api.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "weixin-tests-"));
process.on("exit", () => fs.rmSync(root, { recursive: true, force: true }));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, timeout = 8000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await check()) return;
    await delay(40);
  }
  throw new Error("Timed out waiting for condition");
}
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}
async function launch(t, env = {}) {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise(resolve => probe.close(resolve));
  const isolatedDir = fs.mkdtempSync(path.join(root, "http-"));
  const child = spawn(process.execPath, ["dist/server-http.js", "--port", String(port)], {
    env: { ...process.env, WEIXIN_MCP_DIR: isolatedDir, WEIXIN_WEBHOOK_URL: "", ...env }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", data => output += data);
  child.stderr.on("data", data => output += data);
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
  });
  await waitFor(async () => {
    if (child.exitCode !== null) throw new Error(output);
    try { return (await fetch(`http://127.0.0.1:${port}/health`)).ok; } catch { return false; }
  });
  return { port, child, get output() { return output; } };
}

test("text and all media senders reject HTTP-200 business failures", async () => {
  const original = global.fetch;
  const media = { aeskey: "00".repeat(16), downloadEncryptedQueryParam: "fake", filekey: "fake", fileSize: 1, fileSizeCiphertext: 16 };
  try {
    for (const failure of [{ ret: 500, errmsg: "rejected" }, { ret: 0, errcode: -1, errmsg: "rejected" }]) {
      global.fetch = async () => new Response(JSON.stringify(failure));
      await assert.rejects(() => sendTextMessage("fake", "hello", "token", "https://example.com"), /rejected/);
      for (const send of [sendImageMessage, sendFileMessage, sendVideoMessage]) {
        await assert.rejects(() => send("fake", media, "token", "https://example.com"), /rejected/);
      }
    }
    global.fetch = async () => new Response(JSON.stringify({ ret: 0, errcode: 0 }));
    await sendTextMessage("fake", "hello", "token", "https://example.com");
    for (const send of [sendImageMessage, sendFileMessage, sendVideoMessage]) {
      await send("fake", media, "token", "https://example.com");
    }
  } finally { global.fetch = original; }
});

test("HTTP server only accepts loopback Host and Origin", async t => {
  const { port } = await launch(t);
  const req = (headers) => new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: "/health", headers }, response => {
      response.resume();
      resolve({ status: response.statusCode });
    });
    request.on("error", reject);
  });
  assert.equal((await req({ Host: `attacker.example:${port}` })).status, 403);
  assert.equal((await req({ Origin: "https://attacker.example" })).status, 403);
  assert.equal((await req({ Origin: `http://localhost:${port}` })).status, 200);
});

test("explicit account directories isolate daemon metadata and contacts", () => {
  for (const name of ["a", "b"]) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "daemon.json"), JSON.stringify({ pid: process.pid, port: name === "a" ? 3001 : 3002 }));
    fs.writeFileSync(path.join(dir, "fake.json"), JSON.stringify({ token: "fake-token" }));
    const script = `import {daemonStatus} from './dist/daemon.js'; import {saveContacts,loadContacts} from './dist/contacts.js'; saveContacts({${name}:{userId:'${name}'}}); console.log(JSON.stringify({status:daemonStatus(),contacts:loadContacts()}));`;
    const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, WEIXIN_MCP_DIR: dir }, encoding: "utf8",
    }));
    assert.equal(result.status.running, true);
    assert.equal(result.status.info.port, name === "a" ? 3001 : 3002);
    assert.ok(fs.existsSync(path.join(dir, "contacts.json")));
    const listed = execFileSync(process.execPath, ["dist/cli.js", "accounts", "list"], {
      env: { ...process.env, WEIXIN_MCP_DIR: dir }, encoding: "utf8",
    });
    assert.match(listed, /Accounts \(1\)/);
  }
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(root, "a", "contacts.json")))), ["a"]);
});

test("HTTP MCP initializes, lists tools and reports missing login as a tool error", async t => {
  const { port } = await launch(t);
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
  const client = new Client({ name: "regression-test", version: "1" });
  t.after(() => client.close());
  await client.connect(transport);
  assert.ok((await client.listTools()).tools.some(tool => tool.name === "weixin_send"));
  assert.equal((await client.callTool({ name: "weixin_poll", arguments: {} })).isError, true);
  await transport.terminateSession();
  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(health.sessions, 0);
});

test("webhook failure retries the pending batch before advancing cursor", async t => {
  const dir = path.join(root, "webhook");
  fs.mkdirSync(dir);
  let deliveries = 0;
  let ack = false;
  let firstCursor;
  const api = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { get_updates_buf: cursor } = JSON.parse(body);
    if (ack) await delay(40);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(cursor ? { ret: 0, msgs: [], get_updates_buf: "next" } : {
      ret: 0, msgs: [{ message_id: "1", from_user_id: "fake@im.wechat", item_list: [] }], get_updates_buf: "next",
    }));
  });
  const apiPort = await listen(api);
  const hook = http.createServer(async (req, res) => {
    for await (const _ of req) { /* drain */ }
    deliveries++;
    if (deliveries === 1) {
      const file = path.join(dir, "fake.cursor.json");
      firstCursor = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)).cursor : "";
      res.writeHead(503); res.end("temporarily unavailable");
    } else { ack = true; res.end("ok"); }
  });
  const hookPort = await listen(hook);
  t.after(() => { api.closeAllConnections(); api.close(); hook.closeAllConnections(); hook.close(); });
  fs.writeFileSync(path.join(dir, "fake.json"), JSON.stringify({ token: "fake-token", baseUrl: `http://127.0.0.1:${apiPort}` }));
  const server = await launch(t, { WEIXIN_MCP_DIR: dir, WEIXIN_WEBHOOK_URL: `http://127.0.0.1:${hookPort}` });
  await waitFor(() => deliveries >= 1);
  assert.equal(firstCursor, "", "failed delivery must not commit cursor");
  await waitFor(() => ack);
  await waitFor(() => fs.existsSync(path.join(dir, "fake.cursor.json")));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "fake.cursor.json"))).cursor, "next");
  assert.ok(!server.output.includes("Pushed 1 message(s)") || ack);
});
