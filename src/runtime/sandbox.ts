import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CodeModeSDK, ExecutionResult, SandboxOptions } from "../types.js";
import { transpileTypeScript } from "./transpiler.js";
import { formatValue, smartTruncate, estimateTokens } from "../utils/truncator.js";

function getWorkerPath(): string {
  try {
    const currentFile = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
    const dir = path.dirname(currentFile);
    return path.join(dir, "worker-runner.ts");
  } catch {
    return path.resolve(process.cwd(), "src/runtime/worker-runner.ts");
  }
}

export class CodeModeSandbox {
  constructor(private sdk: CodeModeSDK) {}

  async run(code: string, options: SandboxOptions = {}): Promise<ExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs || 60000;

    // Transpile TypeScript code if needed
    let executableJs: string;
    try {
      executableJs = transpileTypeScript(code);
    } catch (e: any) {
      const durationMs = Date.now() - startTime;
      return {
        success: false,
        output: `Transpilation Error: ${e?.message || e}`,
        logs: [],
        durationMs,
        error: e?.message || String(e),
      };
    }

    return new Promise<ExecutionResult>((resolve) => {
      let settled = false;
      let worker: Worker | null = null;
      let timer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (worker) {
          worker.terminate().catch(() => {});
          worker = null;
        }
      };

      const finish = (result: ExecutionResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      // Listen to AbortSignal
      if (options.abortSignal) {
        if (options.abortSignal.aborted) {
          return finish({
            success: false,
            output: "[Execution Aborted]: Operation was cancelled by user.",
            logs: [],
            durationMs: Date.now() - startTime,
            error: "Aborted by user",
          });
        }
        options.abortSignal.addEventListener(
          "abort",
          () => {
            finish({
              success: false,
              output: "[Execution Aborted]: Operation was cancelled by user.",
              logs: [],
              durationMs: Date.now() - startTime,
              error: "Aborted by user",
            });
          },
          { once: true }
        );
      }

      // Start Timeout Watchdog
      timer = setTimeout(() => {
        finish({
          success: false,
          output:
            `[Execution Timeout]: Code execution exceeded timeout limit of ${timeoutMs}ms and was terminated by the watchdog. ` +
            `Likely causes: an infinite loop (e.g. while(true) without a bound), unbounded recursion, or a search/list over a huge directory tree. ` +
            `Rewrite the program with bounded loops, result caps (maxResults, maxLines, maxBytes), and try/catch around IO operations.`,
          logs: [],
          durationMs: Date.now() - startTime,
          error: `Timeout after ${timeoutMs}ms`,
        });
      }, timeoutMs);

      try {
        const workerPath = getWorkerPath();

        worker = new Worker(workerPath, {
          workerData: {
            code: executableJs,
            baseDir: this.sdk.directory,
            worktree: this.sdk.worktree,
            sessionID: this.sdk.sessionID,
            initialState: this.sdk.state,
          },
        });

        worker.on("message", (msg: any) => {
          const durationMs = Date.now() - startTime;
          const logs: string[] = msg.logs || [];

          if (msg.success) {
            if (msg.state && typeof msg.state === "object") {
              Object.assign(this.sdk.state, msg.state);
            }

            let outputBody = "";
            if (logs.length > 0) {
              outputBody += logs.join("\n");
            }

            if (msg.result !== undefined) {
              const formattedResult = formatValue(msg.result);
              if (outputBody.length > 0) {
                outputBody += "\n\n[Return Value]:\n" + formattedResult;
              } else {
                outputBody = formattedResult;
              }
            }

            if (outputBody.trim().length === 0) {
              outputBody = "(Execution completed successfully with no output)";
            }

            const truncated = smartTruncate(outputBody, {
              maxLines: options.maxLogLines,
              maxChars: options.maxOutputChars,
            });

            finish({
              success: true,
              output: truncated.text,
              logs,
              result: msg.result,
              durationMs,
              tokenSavedEstimate: Math.max(0, estimateTokens(outputBody) * 3),
            });
          } else {
            let outputBody = "";
            if (logs.length > 0) {
              outputBody += logs.join("\n") + "\n\n";
            }
            outputBody += `[Execution Error]: ${msg.error || "Unknown Error"}`;
            if (msg.stack) {
              const stackLines = msg.stack.split("\n");
              const head = stackLines.slice(0, 8).join("\n");
              const omitted = stackLines.length > 8 ? `\n... (${stackLines.length - 8} more stack lines omitted)` : "";
              outputBody += `\n${head}${omitted}`;
            }
            outputBody +=
              `\n\n[Debug Hint]: The stack refers to transpiled code, so line numbers may not match your source. ` +
              `Check the failing operation (missing file, permission denied, wrong type at runtime) and rewrite with try/catch, existence checks, and result caps.`;

            const truncated = smartTruncate(outputBody, {
              maxLines: options.maxLogLines,
              maxChars: options.maxOutputChars,
            });

            finish({
              success: false,
              output: truncated.text,
              logs,
              durationMs,
              error: msg.error || "Unknown Error",
            });
          }
        });

        worker.on("error", (err) => {
          const durationMs = Date.now() - startTime;
          finish({
            success: false,
            output: `[Worker Error]: ${err.message || String(err)}`,
            logs: [],
            durationMs,
            error: err.message || String(err),
          });
        });

        worker.on("exit", (code) => {
          if (!settled && code !== 0) {
            finish({
              success: false,
              output: `[Worker Terminated]: Exited with code ${code}`,
              logs: [],
              durationMs: Date.now() - startTime,
              error: `Worker exit code ${code}`,
            });
          }
        });
      } catch (err: any) {
        finish({
          success: false,
          output: `[Sandbox Startup Error]: ${err?.message || String(err)}`,
          logs: [],
          durationMs: Date.now() - startTime,
          error: err?.message || String(err),
        });
      }
    });
  }
}
