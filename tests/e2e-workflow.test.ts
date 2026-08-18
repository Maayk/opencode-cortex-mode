import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { CodeModeSandbox } from "../src/runtime/sandbox.js";
import { createCodeModeSDK } from "../src/sdk/index.js";

const E2E_DIR = path.resolve(process.cwd(), "tests/tmp_e2e_workspace");

describe("E2E Real-world Multi-step Refactoring Workflow", () => {
  beforeAll(async () => {
    if (fsSync.existsSync(E2E_DIR)) {
      await fs.rm(E2E_DIR, { recursive: true, force: true });
    }
    await fs.mkdir(path.join(E2E_DIR, "packages/api/config"), { recursive: true });
    await fs.mkdir(path.join(E2E_DIR, "packages/auth/config"), { recursive: true });
    await fs.mkdir(path.join(E2E_DIR, "packages/web/config"), { recursive: true });

    await fs.writeFile(
      path.join(E2E_DIR, "packages/api/config/dev.json"),
      JSON.stringify({ name: "api", env: "development", port: 3000 }, null, 2)
    );
    await fs.writeFile(
      path.join(E2E_DIR, "packages/auth/config/dev.json"),
      JSON.stringify({ name: "auth", env: "development", port: 3001 }, null, 2)
    );
    await fs.writeFile(
      path.join(E2E_DIR, "packages/web/config/prod.json"),
      JSON.stringify({ name: "web", env: "production", port: 80 }, null, 2)
    );
  });

  afterAll(async () => {
    if (fsSync.existsSync(E2E_DIR)) {
      await fs.rm(E2E_DIR, { recursive: true, force: true });
    }
  });

  const sdk = createCodeModeSDK({ directory: E2E_DIR, sessionID: "e2e-session" });
  const sandbox = new CodeModeSandbox(sdk);

  it("should perform a 5-step refactoring workflow in 1 single turn", async () => {
    const multiStepScript = `
      // Step 1: Find all config json files
      const configFiles = await glob("packages/**/config/*.json");
      console.log("Discovered config files count:", configFiles.length);

      // Step 2: Read and filter only development configs
      const updatedPackages: string[] = [];
      for (const file of configFiles) {
        const raw = await read(file);
        const data = JSON.parse(raw);
        if (data.env === "development") {
          data.port += 5000; // Increment port
          data.updatedAt = "2026-08-18";
          await write(file, JSON.stringify(data, null, 2));
          updatedPackages.push(data.name);
        }
      }

      console.log("Updated packages:", updatedPackages.join(", "));

      // Step 3: Run quick shell verification
      const checkCmd = os.platform() === "win32" ? "Write-Output 'Refactor verification passed'" : "echo 'Refactor verification passed'";
      const checkResult = await bash(checkCmd);
      console.log("Check output:", checkResult.stdout.trim());

      // Step 4: Persist in session state for subsequent prompts
      state.lastRefactor = {
        packages: updatedPackages,
        timestamp: Date.now()
      };

      return {
        status: "success",
        updatedCount: updatedPackages.length,
        packages: updatedPackages
      };
    `;

    const res = await sandbox.run(multiStepScript);
    expect(res.success).toBe(true);
    expect(res.output).toContain("Discovered config files count: 3");
    expect(res.output).toContain("Updated packages: api, auth");
    expect(res.output).toContain("Refactor verification passed");
    expect(res.result.updatedCount).toBe(2);

    // Verify file on disk
    const apiDev = JSON.parse(await fs.readFile(path.join(E2E_DIR, "packages/api/config/dev.json"), "utf8"));
    expect(apiDev.port).toBe(8000);
  });
});
