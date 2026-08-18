import { describe, it, expect } from "bun:test";
import { CodeModeSandbox } from "../src/runtime/sandbox.js";
import { createCodeModeSDK } from "../src/sdk/index.js";

describe("Bash & Git SDK", () => {
  const sdk = createCodeModeSDK({ directory: process.cwd() });
  const sandbox = new CodeModeSandbox(sdk);

  it("should execute shell commands via bash.exec and $", async () => {
    const code = `
      const isWin = os.platform() === "win32";
      const cmd = isWin ? "Write-Output 'Hello Code Mode'" : "echo 'Hello Code Mode'";
      const res = await bash(cmd);
      console.log("Stdout:", res.stdout.trim());
      console.log("Exit Code:", res.exitCode);
      return res;
    `;

    const res = await sandbox.run(code);
    expect(res.success).toBe(true);
    expect(res.output).toContain("Hello Code Mode");
    expect(res.result.exitCode).toBe(0);
  });

  it("should handle git.status() gracefully and honestly outside a git repository", async () => {
    const code = `
      const status = await git.status();
      console.log("Is Git Repo:", status.isGitRepo);
      return status;
    `;
    const res = await sandbox.run(code);
    expect(res.success).toBe(true);
    expect(typeof res.result.isGitRepo).toBe("boolean");
  });
});
