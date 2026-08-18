import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { CodeModeSandbox } from "../src/runtime/sandbox.js";
import { createCodeModeSDK } from "../src/sdk/index.js";

const SEARCH_DIR = path.resolve(process.cwd(), "tests/tmp_search_test");

describe("Search SDK (Glob & Grep)", () => {
  beforeAll(async () => {
    if (!fsSync.existsSync(SEARCH_DIR)) {
      await fs.mkdir(SEARCH_DIR, { recursive: true });
      await fs.mkdir(path.join(SEARCH_DIR, "src/components"), { recursive: true });
      await fs.mkdir(path.join(SEARCH_DIR, "src/utils"), { recursive: true });

      await fs.writeFile(
        path.join(SEARCH_DIR, "src/components/Button.tsx"),
        'export function Button() { return <button className="btn-primary">Click</button>; }'
      );
      await fs.writeFile(
        path.join(SEARCH_DIR, "src/components/Modal.tsx"),
        'export function Modal() { return <div className="modal-container">Modal Body</div>; }'
      );
      await fs.writeFile(
        path.join(SEARCH_DIR, "src/utils/auth.ts"),
        'export function validateToken(token: string): boolean {\n  if (!token) return false;\n  return token.startsWith("jwt_");\n}'
      );
    }
  });

  afterAll(async () => {
    if (fsSync.existsSync(SEARCH_DIR)) {
      await fs.rm(SEARCH_DIR, { recursive: true, force: true });
    }
  });

  const sdk = createCodeModeSDK({ directory: SEARCH_DIR });
  const sandbox = new CodeModeSandbox(sdk);

  it("should perform glob search and in-memory filtering", async () => {
    const code = `
      const tsxFiles = await glob("**/*.tsx");
      console.log("TSX Files count:", tsxFiles.length);

      const allTs = await glob("**/*.ts*");
      console.log("All TS files:", allTs.sort());

      return { tsxFiles, allTs };
    `;

    const res = await sandbox.run(code);
    expect(res.success).toBe(true);
    expect(res.output).toContain("TSX Files count: 2");
    expect(res.result.tsxFiles.length).toBe(2);
  });

  it("should grep across files and return file, line, and matched content", async () => {
    const code = `
      const matches = await grep("validateToken");
      console.log("Grep matches:", matches.length);
      console.log("Matched file:", matches[0].file);
      console.log("Matched line:", matches[0].line);
      return matches;
    `;

    const res = await sandbox.run(code);
    expect(res.success).toBe(true);
    expect(res.result.length).toBe(1);
    expect(res.result[0].file).toContain("auth.ts");
    expect(res.result[0].line).toBe(1);
  });
});
