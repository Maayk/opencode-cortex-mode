# SDK Reference: OpenCode Cortex Mode

The **OpenCode Cortex Mode SDK** injects a complete set of asynchronous tools and global utilities into the script execution environment.

---

## 1. Available Globals

Inside a script passed to `code_mode`, the following functions and variables are available in the global scope or via the unified `sdk` object:

| Global | Type | Description |
|---|---|---|
| `fs` | `FileSystemSDK` | Complete file system operations |
| `search` | `SearchSDK` | File search (`glob`) and content search (`grep`) |
| `bash`, `sh`, `$` | `BashSDK` | Shell command execution |
| `git` | `GitSDK` | Git queries and operations |
| `state` | `Record<string, any>` | In-memory persistent state for the session |
| `read` | `fs.read` | Shortcut for reading files |
| `write` | `fs.write` | Shortcut for writing/creating files |
| `edit` | `fs.edit` | Shortcut for surgical string replacement |
| `exists` | `fs.exists` | Shortcut for existence checks |
| `glob` | `search.glob` | Shortcut for path search |
| `grep` | `search.grep` | Shortcut for text search in files |
| `exec` | `bash.exec` | Shortcut for shell command execution |
| `console` | `Console` | Intercepts logs (`log`, `warn`, `error`, `table`, `dir`) |
| `path`, `crypto`, `os` | Node modules | Standard Node.js/Bun utility modules |

---

## 2. FileSystem SDK (`fs`, `read`, `write`, `edit`)

### 2.1 `read(filePath, options?)`

Reads the content of a text file.

```typescript
const fullText = await read("src/index.ts");
const lines = await read("src/large.log", { startLine: 100, endLine: 150 });
const truncated = await read("data.bin", { maxBytes: 1024 });
```

`maxBytes` truncates oversized content and appends a `... [output truncated by maxBytes]` marker; line ranges are applied to the truncated content.

### 2.2 `write(filePath, content, options?)`

Creates or overwrites a file, creating parent directories automatically when needed.

```typescript
await write("dist/output.json", JSON.stringify({ ok: true }, null, 2));
await write("src/new-file.ts", "export const x = 1;", { overwrite: true });
```

### 2.3 `edit(filePath, oldText, newText, options?)`

Replaces a single occurrence of text in an existing file with strict validation.

```typescript
await edit("src/config.ts", "port: 3000", "port: 8080");
// Optional multiple replacement
await edit("src/theme.css", "color: red", "color: blue", { allowMultiple: true });
```

### 2.4 `exists(filePath)`

Checks whether a path exists.

```typescript
if (await exists("package.json")) {
  console.log("Node/Bun project detected");
}
```

### 2.5 `list(dirPath?, recursive?)`

Lists files and directories with structured metadata.

```typescript
const items = await fs.list("src", true);
for (const item of items) {
  console.log(`${item.isDirectory ? "[DIR]" : "[FILE]"} ${item.path}`);
}
```

Entries are returned in deterministic alphabetical order. Recursive listing stops after 10,000 entries and skips `node_modules` and `.git`.

---

## 3. Search SDK (`search`, `glob`, `grep`)

### 3.1 `glob(pattern | patterns[], options?)`

Searches for files matching a glob pattern.

```typescript
const tsFiles = await glob("src/**/*.ts");
const allConfigs = await glob(["config/*.json", "packages/**/config.json"], {
  ignore: ["**/node_modules/**", "**/dist/**"]
});
```

Results are returned in deterministic alphabetical order and capped at `maxResults` (default 1,000); `node_modules`, `.git`, and `dist` are ignored by default.

### 3.2 `grep(query | RegExp, options?)`

Searches for text patterns across files on disk.

```typescript
const matches = await grep("calculateTax", { path: "src", caseInsensitive: true });
for (const m of matches) {
  console.log(`Found in ${m.file}:${m.line} -> ${m.content}`);
}
```

---

## 4. Shell and Command Execution (`bash`, `sh`, `$`, `exec`)

### 4.1 `bash(command, options?)` or `$(command)`

Executes shell commands, respecting the host operating system (PowerShell on Windows, Bash on Linux/macOS).

```typescript
const res = await $("npm test");
console.log(`Exit Code: ${res.exitCode}, Duration: ${res.durationMs}ms`);
if (res.exitCode !== 0) {
  console.error("Tests failed:", res.stderr);
}
```

Commands run with a 60-second default timeout (`options.timeout` overrides). Spawned processes are tracked by the runtime and killed along with their tree when the execution is terminated (timeout, memory limit, abort, or completion); on Unix, commands run in their own process group.

---

## 5. Git Helpers (`git`)

```typescript
const status = await git.status();
console.log("Branch:", status.branch);
console.log("Modified:", status.modified);
console.log("Untracked:", status.untracked);

const diff = await git.diff("src/index.ts");
const commits = await git.log(5);
```

---

## 6. Persistent Session State (`state`)

The `state` object keeps any variable in memory during the chat session:

```typescript
// Turn 1:
state.scannedRoutes = await glob("src/routes/*.ts");
state.processedCount = 0;

// Turn 2:
console.log("Known routes:", state.scannedRoutes.length);
```

State is scoped to the session and automatically cleared when the session ends; idle sessions are pruned once more than 100 accumulate.

---

## 7. Sandbox Limits and Error Semantics

| Limit | Default | Behavior on breach |
|---|---|---|
| Wall-clock timeout | 60s (`timeout` arg) | `[Execution Timeout]` with likely-cause diagnosis (infinite loop, unbounded recursion, oversized scans) |
| Host memory delta | 768MB (`maxMemoryDeltaMb` arg) | `[Execution Error]` memory-budget message; worker terminated (RSS sampled every 250ms; Node also enforces a 512MB V8 heap via `resourceLimits`) |
| Console output | 500KB cumulative | Further output suppressed with a marker line |
| Result truncation | 150 lines / 40,000 chars | Head-tail compaction via `smartTruncate` |
| Stack traces | 8 lines | Truncated with a note that transpiled line numbers may not match the source |

Failures always include a `[Debug Hint]` steering the model toward the cause (missing file, permission, runtime type error) and the remediation pattern (try/catch, existence checks, result caps).
