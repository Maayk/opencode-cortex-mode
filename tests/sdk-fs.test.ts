import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { CodeModeSandbox } from "../src/runtime/sandbox.js";
import { createCodeModeSDK } from "../src/sdk/index.js";

const TEST_DIR = path.resolve(process.cwd(), "tests/tmp_fs_test");

describe("File System SDK Operations", () => {
  beforeAll(async () => {
    if (!fsSync.existsSync(TEST_DIR)) {
      await fs.mkdir(TEST_DIR, { recursive: true });
    }
  });

  afterAll(async () => {
    if (fsSync.existsSync(TEST_DIR)) {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  const sdk = createCodeModeSDK({ directory: TEST_DIR });
  const sandbox = new CodeModeSandbox(sdk);

  it("should write, read, edit, and stat files in 1 execution turn", async () => {
    const code = `
      // 1. Write file
      await write("config.json", JSON.stringify({ port: 8080, debug: false }, null, 2));

      // 2. Read file
      const raw = await read("config.json");
      const parsed = JSON.parse(raw);
      console.log("Initial Port:", parsed.port);

      // 3. Edit file
      await edit("config.json", '"debug": false', '"debug": true');

      // 4. Verify edit
      const updated = await read("config.json");
      console.log("Updated config contains debug true:", updated.includes('"debug": true'));

      // 5. Stat file
      const info = await fs.stat("config.json");
      console.log("File size bytes:", info.size);

      return { success: true, updatedConfig: JSON.parse(updated) };
    `;

    const res = await sandbox.run(code);
    expect(res.success).toBe(true);
    expect(res.output).toContain("Initial Port: 8080");
    expect(res.output).toContain("Updated config contains debug true: true");
    expect(res.result.updatedConfig.debug).toBe(true);
  });

  it("should support line range reads", async () => {
    const code = `
      await write("lines.txt", "Line 1\\nLine 2\\nLine 3\\nLine 4\\nLine 5");
      const slice = await read("lines.txt", { startLine: 2, endLine: 4 });
      console.log("Sliced:\\n" + slice);
      return slice;
    `;
    const res = await sandbox.run(code);
    expect(res.success).toBe(true);
    expect(res.result).toBe("Line 2\nLine 3\nLine 4");
  });
});
