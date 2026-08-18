import { describe, it, expect } from "bun:test";
import { CodeModeSandbox } from "../src/runtime/sandbox.js";
import { createCodeModeSDK } from "../src/sdk/index.js";

describe("Sandbox Safety, Error Handling & Timeout", () => {
  const sdk = createCodeModeSDK({ directory: process.cwd() });
  const sandbox = new CodeModeSandbox(sdk);

  it("should cleanly catch syntax and runtime errors without crashing the host process", async () => {
    const code = `
      const obj = null;
      console.log("Before error");
      obj.someMethod(); // TypeError
      console.log("After error");
    `;

    const res = await sandbox.run(code);
    expect(res.success).toBe(false);
    expect(res.output).toContain("Before error");
    expect(res.output).toContain("Execution Error");
    expect(res.output).not.toContain("After error");
  });

  it("should timeout and kill asynchronous long-running promises", async () => {
    const code = `
      console.log("Starting slow job");
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log("Finished slow job");
    `;

    const res = await sandbox.run(code, { timeoutMs: 300 });
    expect(res.success).toBe(false);
    expect(res.output).toContain("exceeded timeout limit of 300ms");
  });

  it("should terminate synchronous infinite loops (while true) without freezing OpenCode", async () => {
    const code = `
      console.log("Entering infinite loop");
      while (true) {
        // blocking CPU loop
      }
    `;

    const res = await sandbox.run(code, { timeoutMs: 400 });
    expect(res.success).toBe(false);
    expect(res.output).toContain("exceeded timeout limit of 400ms");
  });

  it("should immediately abort when AbortSignal triggers", async () => {
    const controller = new AbortController();
    const code = `
      console.log("Running task that will be cancelled");
      await new Promise(resolve => setTimeout(resolve, 5000));
    `;

    setTimeout(() => {
      controller.abort();
    }, 100);

    const res = await sandbox.run(code, { abortSignal: controller.signal, timeoutMs: 5000 });
    expect(res.success).toBe(false);
    expect(res.output).toContain("Execution Aborted");
  });
});
