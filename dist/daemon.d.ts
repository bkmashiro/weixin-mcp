/**
 * Daemon management for weixin-mcp HTTP server.
 *
 * Daemon runs as a child process, writing its PID and port to ~/.weixin-mcp/daemon.json.
 * All daemon output is appended to ~/.weixin-mcp/daemon.log.
 */
interface DaemonInfo {
    pid: number;
    port: number;
    startedAt: string;
}
export declare function daemonStatus(): {
    running: boolean;
    info: DaemonInfo | null;
};
export declare function startDaemon(port?: number, webhook?: string): Promise<void>;
export declare function stopDaemon(): void;
export declare function restartDaemon(port?: number): Promise<void>;
export declare function showLogs(follow?: boolean): void;
export {};
