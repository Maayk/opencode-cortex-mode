import { describe, it, expect } from "bun:test";
import { CodeModeSandbox } from "../src/runtime/sandbox.js";
import { createCodeModeSDK } from "../src/sdk/index.js";

describe("Basic Execution & Transpilation", () => {
  const sdk = createCodeModeSDK({ directory: process.cwd() });
  const sandbox = new CodeModeSandbox(sdk);

  it("should execute standard JavaScript and capture console.log and return value", async () => {
    const code = `
      const a = 10;
      const b = 20;
      console.log("Sum:", a + b);
      return { total: a + b };
    `;
    const res = await sandbox.run(code);
    expect(res.success).toBe(true);
    expect(res.output).toContain("Sum: 30");
    expect(res.output).toContain("total: 30");
    expect(res.result.total).toBe(30);
  });

  it("should seamlessly execute modern TypeScript with types and interfaces", async () => {
    const code = `
      interface User {
        id: number;
        name: string;
        roles: string[];
      }

      const users: User[] = [
        { id: 1, name: "Alice", roles: ["admin"] },
        { id: 2, name: "Bob", roles: ["dev"] }
      ];

      const admins = users.filter((u: User) => u.roles.includes("admin"));
      console.log("Found admins:", admins.length);
      return admins;
    `;
    const res = await sandbox.run(code);
    expect(res.success).toBe(true);
    expect(res.output).toContain("Found admins: 1");
    expect(res.result[0].name).toBe("Alice");
  });
});
