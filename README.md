# OpenCode Cortex Mode

> **Experimental:** This plugin is under active development and is being tested. APIs, behavior, and the SDK surface may change without notice between releases. Use at your own risk and report issues on GitHub.

Cortex Mode is a single-turn code orchestration plugin for [OpenCode](https://opencode.ai), based on the DeepSeek Harness (`dsh`) architecture. Instead of driving the model through a sequence of individual tool calls, Cortex Mode provides a TypeScript/JavaScript SDK that the model can use to generate a single program covering an entire workflow.

The program runs locally in the OpenCode runtime and returns one consolidated result. Searches, file manipulation, logical filters, loops, and shell commands execute inside the runtime without requiring a new inference round per step.

## How it works

**Traditional agent (native tool calling):**

```
LLM -> tool call -> result -> LLM -> tool call -> result -> LLM -> ...
```

Every step of the workflow requires a new inference round, and every intermediate result (file listings, search output, command logs) is written back into the conversation context and re-sent on subsequent turns.

**Cortex Mode:**

```
LLM -> generated program -> Cortex runtime executes -> consolidated result -> LLM
                              loops, filters, searches,
                              file transformations,
                              shell commands
```

The runtime performs the deterministic parts of the workflow — iterating, filtering, searching, transforming multiple files, running commands — and only the consolidated result returns to the model.

### What Cortex Mode does not replace

Cortex Mode does not replace model reasoning. It moves deterministic orchestration from the model to the runtime: work that does not require inference (loops, filters, searches, multi-file processing, transformations, command execution, composite workflows) runs locally. Reasoning, planning, and judgment remain the model's responsibility.

## Features

- **Fewer inference round trips:** A workflow that would require several sequential tool calls can complete in a single AI turn.
- **Reduced context growth:** Intermediate outputs are consumed inside the runtime; only the consolidated result enters the conversation context.
- **Deterministic orchestration in the runtime:** Loops, filters, searches, file transformations, and shell commands run as one generated program instead of one tool call per step.
- **Persistent session state (`state`):** In-memory data cache shared across execution turns.
- **Native TypeScript and JavaScript support:** Instant transpilation with Bun or Node.js.
- **Full OpenCode compatibility:** Drop-in at `.config/opencode/plugin/code_mode.js`.

## Performance

The performance figures below are **observed estimates, not guarantees**. Results depend on the task, the model, the provider's latency, the hardware, the context window, and the specific workflow being executed.

### What is being compared

The comparison is between two ways of completing the same multi-step task:

- **Native tool calling:** the model issues one tool call per step; each step requires an inference round and each tool result is appended to the conversation history.
- **Cortex Mode:** the model generates a single program; the runtime executes the deterministic steps locally and returns one consolidated result.

### Where the gain comes from

1. **Reduction of inference round trips.** In native tool calling, an N-step workflow requires roughly N tool-call cycles, each with an LLM round trip. In Cortex Mode, the same workflow requires one generation and one runtime execution.
2. **Reduction of intermediate context.** Tool outputs accumulate in the conversation history and are re-sent on every subsequent turn, so billed input grows with each step. Cortex Mode keeps intermediate data (file listings, search results, command logs) inside the runtime and returns only the summary.

### Observed results

Analytical estimates for representative scenarios (a multi-file refactor, a codebase audit, and a diagnose-and-fix pipeline) are documented in [docs/BENCHMARKS.md](docs/BENCHMARKS.md). On workflows dominated by deterministic operations, the estimates suggest:

- **~11–15x lower estimated latency** compared to native tool calling on the same task;
- **observed token reductions of ~90–95%** on some workflows.

These numbers assume typical LLM round trips (8-15s per inference) and common tool-output sizes. They are workload-dependent and should be re-measured against a live provider for any specific use case. They are not claims about every task: tasks dominated by model reasoning rather than deterministic orchestration will see smaller differences.

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
