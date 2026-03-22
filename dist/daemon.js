/**
 * Daemon management for weixin-mcp HTTP server.
 *
 * Daemon runs as a child process, writing its PID and port to ~/.weixin-mcp/daemon.json.
 * All daemon output is appended to ~/.weixin-mcp/daemon.log.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const DATA_DIR = path.join(os.homedir(), ".weixin-mcp");
const PID_FILE = path.join(DATA_DIR, "daemon.json");
const LOG_FILE = path.join(DATA_DIR, "daemon.log");
const DEFAULT_PORT = 3001;
function readDaemonInfo() {
    try {
        return JSON.parse(fs.readFileSync(PID_FILE, "utf-8"));
    }
    catch {
        return null;
    }
}
function isRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
export function daemonStatus() {
    const info = readDaemonInfo();
    if (!info)
        return { running: false, info: null };
    const running = isRunning(info.pid);
    if (!running) {
        // stale PID file
        try {
            fs.unlinkSync(PID_FILE);
        }
        catch { }
    }
    return { running, info: running ? info : null };
}
export async function startDaemon(port = DEFAULT_PORT) {
    const { running, info } = daemonStatus();
    if (running && info) {
        console.log(`⚠️  Daemon already running (pid ${info.pid}, port ${info.port})`);
        return;
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverScript = path.join(__dirname, "server-http.js");
    const logFd = fs.openSync(LOG_FILE, "a");
    const child = spawn(process.execPath, [serverScript, String(port)], {
        detached: true,
        stdio: ["ignore", logFd, logFd],
        env: { ...process.env, WEIXIN_MCP_PORT: String(port) },
    });
    child.unref();
    fs.closeSync(logFd);
    // Wait briefly for the process to start
    await new Promise((r) => setTimeout(r, 800));
    if (!isRunning(child.pid)) {
        console.error("❌ Daemon failed to start. Check logs:");
        console.error(`   npx weixin-mcp logs`);
        process.exit(1);
    }
    const daemonInfo = {
        pid: child.pid,
        port,
        startedAt: new Date().toISOString(),
    };
    fs.writeFileSync(PID_FILE, JSON.stringify(daemonInfo, null, 2));
    console.log(`✅ weixin-mcp daemon started`);
    console.log(`   PID:  ${child.pid}`);
    console.log(`   Port: ${port}`);
    console.log(`   URL:  http://localhost:${port}/mcp`);
    console.log(`   Logs: ${LOG_FILE}`);
}
export function stopDaemon() {
    const { running, info } = daemonStatus();
    if (!running || !info) {
        console.log("ℹ️  Daemon is not running.");
        return;
    }
    try {
        process.kill(info.pid, "SIGTERM");
        try {
            fs.unlinkSync(PID_FILE);
        }
        catch { }
        console.log(`✅ Daemon stopped (pid ${info.pid})`);
    }
    catch (err) {
        console.error(`❌ Failed to stop daemon: ${String(err)}`);
    }
}
export async function restartDaemon(port) {
    const { info } = daemonStatus();
    stopDaemon();
    await new Promise((r) => setTimeout(r, 500));
    await startDaemon(port ?? info?.port ?? DEFAULT_PORT);
}
export function showLogs(follow = false) {
    if (!fs.existsSync(LOG_FILE)) {
        console.log("No log file yet. Start the daemon first:");
        console.log("  npx weixin-mcp start");
        return;
    }
    if (follow) {
        const tail = spawn("tail", ["-f", LOG_FILE], { stdio: "inherit" });
        process.on("SIGINT", () => tail.kill());
    }
    else {
        const lines = fs.readFileSync(LOG_FILE, "utf-8").split("\n").slice(-50).join("\n");
        console.log(lines);
    }
}
