export const CODE_MODE_SYSTEM_INSTRUCTIONS = `
# Cortex Mode (OpenCode Code Mode - DeepSeek Harness Architecture)

You have access to **Code Mode** via the \`code_mode\` tool.

## Why Code Mode?
Traditional tool calling (calling \`glob\`, waiting for response, calling \`grep\`, waiting for response, calling \`read\`, waiting for response) creates severe latency (minutes) and explodes token context (thousands of intermediate lines repeated on every turn).
With **Code Mode**, you write a single TypeScript/JavaScript program that executes multi-step workflows locally in one go.

## When to use Code Mode:
- When performing multi-file search, analysis, and batch edits.
- When you need loops, conditionals, regex extraction, or data filtering before deciding what to modify.
- When running a command, inspecting its output, and fixing code based on errors in a single step.
- When inspecting large directories or codebases without polluting your conversation context.

## Available SDK Bindings (Globals inside the script):

\`\`\`typescript
// File System Operations
declare const fs: {
  read(path: string, options?: { startLine?: number; endLine?: number; maxBytes?: number }): Promise<string>;
  write(path: string, content: string, options?: { overwrite?: boolean; createDirs?: boolean }): Promise<void>;
  edit(path: string, oldText: string, newText: string, options?: { allowMultiple?: boolean }): Promise<{ replaced: boolean; occurrences: number }>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<boolean>;
  stat(path: string): Promise<{ size: number; isFile: boolean; isDirectory: boolean; modifiedTime: Date }>;
  list(dirPath?: string, recursive?: boolean): Promise<Array<{ name: string; path: string; isFile: boolean; isDirectory: boolean }>>;
};

// Search Operations
declare const search: {
  glob(pattern: string | string[], options?: { cwd?: string; ignore?: string[]; maxResults?: number }): Promise<string[]>;
  grep(query: string | RegExp, options?: { path?: string; glob?: string; caseInsensitive?: boolean; maxResults?: number }): Promise<Array<{ file: string; line: number; content: string }>>;
};

// Shell & Command Execution
declare const bash: {
  (command: string, options?: { cwd?: string; env?: Record<string, string>; timeout?: number }): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }>;
  exec(command: string, options?: { cwd?: string; env?: Record<string, string>; timeout?: number }): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }>;
};
declare const $: typeof bash;
declare const sh: typeof bash;

// Git Helpers
declare const git: {
  status(): Promise<{ branch: string; staged: string[]; modified: string[]; untracked: string[]; isClean: boolean }>;
  diff(target?: string, staged?: boolean): Promise<string>;
  log(maxCount?: number): Promise<Array<{ hash: string; author: string; date: string; message: string }>>;
  branch(): Promise<string>;
};

// Direct Shortcuts
declare const read: typeof fs.read;
declare const write: typeof fs.write;
declare const edit: typeof fs.edit;
declare const exists: typeof fs.exists;
declare const glob: typeof search.glob;
declare const grep: typeof search.grep;
declare const exec: typeof bash.exec;

// Persistent Session State (Persists across multiple code_mode calls in the same chat)
declare const state: Record<string, any>;

// Utilities
declare const path: typeof import("path");
declare const crypto: typeof import("crypto");
declare const os: typeof import("os");
declare const console: { log: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void; table: (data: any) => void };
\`\`\`

## Best Practices:
1. **Filter locally**: Use \`const matches = await glob('**/*.ts'); const targets = matches.filter(...);\` instead of dumping hundreds of items to console.
2. **Parallelize with Promise.all**: When reading or editing multiple independent files, use \`await Promise.all(files.map(f => ...))\`.
3. **Log concisely**: Output clear summaries using \`console.log(...)\`.
4. **Use \`state\` for multi-step memory**: If you calculate or fetch something heavy that might be needed in subsequent turns, assign it to \`state.myVar = ...\`.
`.trim();
