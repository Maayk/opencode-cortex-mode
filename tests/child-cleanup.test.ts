import { describe, it, expect } from "bun:test";
import { execSync } from "node:child_process";
import { CodeModeSandbox } from "../src/runtime/sandbox.js";
import { createCodeModeSDK } from "../src/sdk/index.js";

describe("Child process cleanup on worker termination", () => {
  const sdk = createCodeModeSDK({ directory: process.cwd(), sessionID: "child-cleanup-test" });
  const sandbox = new CodeModeSandbox(sdk);

  it("kills the spawned command tree when the worker is terminated", async () => {
    const marker = "CM_ORPHAN_" + Date.now();
    const winCmd = `powershell -NoProfile -Command \\\"Start-Sleep 60; '${marker}' | Out-Null\\\"`;
    const nixCmd = `sh -c \\\"sleep 60; echo ${marker}\\\"`;

    const res = await sandbox.run(
      `
      await bash(os.platform() === "win32" ? "${winCmd}" : "${nixCmd}");
      await new Promise(() => {});
    `,
      { timeoutMs: 2000 }
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain("Timeout");

    await new Promise((r) => setTimeout(r, 1500));

    const query =
      process.platform === "win32"
        ? `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'powershell.exe' -and $_.CommandLine -like '*${marker}*' -and $_.ProcessId -ne $PID } | Select-Object -ExpandProperty ProcessId"`
        : `pgrep -f "${marker}" || true`;

    const found = execSync(query).toString().trim();
    expect(found).toBe("");
  });
});
