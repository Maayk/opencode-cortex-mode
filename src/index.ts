import { tool } from "@opencode-ai/plugin";
import type { PluginInput } from "@opencode-ai/plugin";
import { createCodeModeSDK } from "./sdk/index.js";
import { CodeModeSandbox } from "./runtime/sandbox.js";
import { CODE_MODE_SYSTEM_INSTRUCTIONS } from "./prompt.js";
import { SessionStateManager } from "./runtime/state.js";

export const CodeModePlugin = async (ctx: PluginInput) => {
  const { client } = ctx;

  const codeModeTool = tool({
    description:
      "Execute multi-step TypeScript/JavaScript scripts locally using the DeepSeek Harness Code Mode SDK. Combines file operations (read, write, edit, stat, list), search (glob, grep), shell execution (bash, $), and git into a single turn without roundtrip wait times or intermediate context bloat. Logs from console.log and return values are captured and returned.",
    args: {
      code: tool.schema
        .string()
        .describe(
          "The TypeScript or JavaScript code to execute. Can use async/await, fs, search, glob, grep, read, write, edit, bash, $, git, state, etc."
        ),
      description: tool.schema
        .string()
        .optional()
        .describe("Short summary of what this code does (e.g. 'Search and replace auth tokens in config files')."),
      timeout: tool.schema
        .number()
        .optional()
        .describe("Execution timeout in milliseconds. Defaults to 60000 (1 minute)."),
    },
    async execute(args, context) {
      const baseDir = context.directory || ctx.directory || process.cwd();
      const worktree = context.worktree || ctx.worktree || baseDir;
      const sessionID = context.sessionID || "default";

      const sdk = createCodeModeSDK({
        directory: baseDir,
        worktree,
        sessionID,
      });

      const sandbox = new CodeModeSandbox(sdk);

      const timeoutMs = args.timeout || 60000;
      const started = Date.now();

      // UI progress metadata
      context.metadata?.({
        title: `Code Mode: ${args.description || "Executing script..."}`,
        metadata: {
          sessionID,
          directory: baseDir,
        },
      });

      const result = await sandbox.run(args.code, {
        timeoutMs,
        abortSignal: context.abort,
      });

      const durationSecs = (result.durationMs / 1000).toFixed(2);

      context.metadata?.({
        title: `Code Mode (${durationSecs}s) - ${args.description || (result.success ? "Success" : "Failed")}`,
        metadata: {
          success: result.success,
          durationMs: result.durationMs,
          tokenSavedEstimate: result.tokenSavedEstimate,
        },
      });

      return result.output;
    },
  });

  return {
    tool: {
      code_mode: codeModeTool,
      dsh_exec: codeModeTool,
    },
    event: async (input: any) => {
      const ev = input?.event ?? input;
      const sessionID = ev?.properties?.sessionID;
      if (!sessionID) return;
      if (ev?.type === "session.end") {
        SessionStateManager.getInstance().clearState(sessionID);
      } else if (ev?.type === "session.idle") {
        SessionStateManager.getInstance().pruneOldSessions();
      }
    },
    "experimental.chat.system.transform": async (input, output) => {
      if (output && Array.isArray(output.system)) {
        output.system.push(CODE_MODE_SYSTEM_INSTRUCTIONS);
      }
    },
  };
};

export default CodeModePlugin;
