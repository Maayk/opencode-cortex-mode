import { describe, it, expect } from "bun:test";
import { CodeModeSandbox } from "../src/runtime/sandbox.js";
import { createCodeModeSDK } from "../src/sdk/index.js";

describe("Persistent Session State", () => {
  const sessionID = "test-session-persistent-123";
  const sdk1 = createCodeModeSDK({ directory: process.cwd(), sessionID });
  const sandbox1 = new CodeModeSandbox(sdk1);

  const sdk2 = createCodeModeSDK({ directory: process.cwd(), sessionID });
  const sandbox2 = new CodeModeSandbox(sdk2);

  it("should persist state variables across multiple execution turns in the same session", async () => {
    // Turn 1: Store data in state
    const turn1Code = `
      state.cachedFiles = ["src/a.ts", "src/b.ts"];
      state.counter = 42;
      console.log("Saved state in Turn 1");
      return state.counter;
    `;
    const res1 = await sandbox1.run(turn1Code);
    expect(res1.success).toBe(true);

    // Turn 2: Retrieve data from state
    const turn2Code = `
      console.log("Retrieved counter in Turn 2:", state.counter);
      console.log("Retrieved files count:", state.cachedFiles.length);
      state.counter += 1;
      return { counter: state.counter, files: state.cachedFiles };
    `;
    const res2 = await sandbox2.run(turn2Code);
    expect(res2.success).toBe(true);
    expect(res2.output).toContain("Retrieved counter in Turn 2: 42");
    expect(res2.output).toContain("Retrieved files count: 2");
    expect(res2.result.counter).toBe(43);
  });
});
