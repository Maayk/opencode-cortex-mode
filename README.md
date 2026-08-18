# OpenCode Cortex Mode

Single-turn code orchestration plugin for [OpenCode](https://opencode.ai), based on the DeepSeek Harness (`dsh`) architecture. Instead of forcing the AI model through multiple atomic tool calls ("call tool -> wait -> call again -> wait", producing minutes of latency and thousands of accumulated tokens), Cortex Mode delivers a complete TypeScript/JavaScript SDK directly to the model.

The model writes a script that runs locally in the OpenCode runtime in milliseconds, performing searches, file manipulation, logical filters, loops, and shell commands in **a single AI turn**.

## Features

- **Up to 10x latency reduction:** From 1-2 minutes down to under 4 seconds per task.
- **80-95% token savings:** Intermediate listings and temporary data never enter the LLM context.
- **Smart spill and head-tail compression:** Protection against oversized outputs that could overflow the conversation context.
- **Persistent session state (`state`):** In-memory data cache shared across execution turns.
- **Native TypeScript and JavaScript support:** Instant transpilation with Bun or Node.js.
- **Full OpenCode compatibility:** Drop-in at `.config/opencode/plugin/code_mode.js`.

## Installation

### Direct installation (plug and play)

Copy `dist/code_mode.js` to your OpenCode plugin folder:

```bash
# Windows
copy dist\code_mode.js %USERPROFILE%\.config\opencode\plugin\code_mode.js

# Linux / macOS
cp dist/code_mode.js ~/.config/opencode/plugin/code_mode.js
```

The plugin automatically registers the `code_mode` tool and the `dsh_exec` alias, and injects usage instructions into the system prompt.

### From source

```bash
bun install
bun run build
bun test
```

## Usage Example

The model uses the SDK globals (`fs`, `search`, `bash`, `git`, `state`) to execute complete workflows in one turn:

```typescript
// Find all dev configs, update the port, and validate
const files = await glob("packages/**/config/*.json");
console.log(`Analyzing ${files.length} files...`);

for (const file of files) {
  const content = JSON.parse(await read(file));
  if (content.env === "development") {
    content.port = 8080;
    await write(file, JSON.stringify(content, null, 2));
    console.log(`Updated: ${file}`);
  }
}

// Run a quick validation
const check = await $("npm test");
console.log("Test status:", check.exitCode === 0 ? "PASS" : "FAIL");
```

## Testing

The project includes a full automated test suite:

```bash
bun test
```

- `tests/basic.test.ts`: JS and TS execution validation.
- `tests/sdk-fs.test.ts`: File read, write, slice, and edit validation.
- `tests/sdk-search.test.ts`: `glob` and `grep` validation.
- `tests/sdk-bash.test.ts`: Shell execution validation.
- `tests/sandbox-timeout.test.ts`: Timeout protection and execution error validation.
- `tests/state.test.ts`: Cross-turn state persistence validation.
- `tests/e2e-workflow.test.ts`: Full multi-step refactor flow in a single turn.

## Documentation

- [End-to-End Architecture and Comparison with DeepSeek Harness](docs/ARCHITECTURE.md)
- [Complete SDK Reference](docs/SDK.md)
- [Performance Analysis and Benchmarks](docs/BENCHMARKS.md)

## License

MIT
