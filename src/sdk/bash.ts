import { spawn } from "node:child_process";
import path from "node:path";
import type { BashSDK, BashExecOptions, BashExecResult } from "../types.js";

function killProcessTree(pid: number): void {
  if (!pid) return;
  if (process.platform === "win32") {
    try {
      const killer = spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.unref();
    } catch {
      // taskkill can fail if the process already exited
    }
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // process may already be gone
      }
    }
  }
}

export function createBashSDK(baseDir: string): BashSDK {
  const execFunction = async (command: string, options: BashExecOptions = {}): Promise<BashExecResult> => {
    const cwd = options.cwd
      ? path.isAbsolute(options.cwd)
        ? options.cwd
        : path.resolve(baseDir, options.cwd)
      : baseDir;
    const timeout = options.timeout || 60000;
    const maxBuffer = options.maxBuffer || 8 * 1024 * 1024; // 8MB

    const isWindows = process.platform === "win32";
    const defaultShell = isWindows ? (process.env.COMSPEC || "powershell.exe") : (process.env.SHELL || "/bin/sh");
    const shell = options.shell || defaultShell;

    let shellArgs: string[];
    if (shell.includes("powershell") || shell.includes("pwsh")) {
      shellArgs = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command];
    } else if (shell.includes("cmd.exe")) {
      shellArgs = ["/c", command];
    } else {
      shellArgs = ["-c", command];
    }

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;

      const child = spawn(shell, shellArgs, {
        cwd,
        env: { ...process.env, ...options.env },
        windowsHide: true,
        detached: !isWindows,
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (child.pid) killProcessTree(child.pid);
        reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
      }, timeout);

      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdout.length + chunk.length <= maxBuffer) {
          stdout += chunk.toString("utf8");
        } else if (stdout.length < maxBuffer) {
          stdout += chunk.toString("utf8").slice(0, maxBuffer - stdout.length) + "\n... [stdout buffer limit reached]";
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        if (stderr.length + chunk.length <= maxBuffer) {
          stderr += chunk.toString("utf8");
        } else if (stderr.length < maxBuffer) {
          stderr += chunk.toString("utf8").slice(0, maxBuffer - stderr.length) + "\n... [stderr buffer limit reached]";
        }
      });

      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });

      child.on("close", (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        resolve({
          command,
          stdout: stdout.trimEnd(),
          stderr: stderr.trimEnd(),
          exitCode: exitCode ?? 0,
          durationMs,
        });
      });
    });
  };

  const bashSDK = execFunction as BashSDK;
  bashSDK.exec = execFunction;

  return bashSDK;
}
