import { parentPort, workerData } from "node:worker_threads";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import util from "node:util";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

const logs: string[] = [];

const customConsole = {
  log: (...args: any[]) => {
    logs.push(args.map((a) => (typeof a === "string" ? a : util.inspect(a, { depth: 4, colors: false }))).join(" "));
  },
  warn: (...args: any[]) => {
    logs.push("[WARN] " + args.map((a) => (typeof a === "string" ? a : util.inspect(a, { depth: 4, colors: false }))).join(" "));
  },
  error: (...args: any[]) => {
    logs.push("[ERROR] " + args.map((a) => (typeof a === "string" ? a : util.inspect(a, { depth: 4, colors: false }))).join(" "));
  },
  info: (...args: any[]) => {
    logs.push("[INFO] " + args.map((a) => (typeof a === "string" ? a : util.inspect(a, { depth: 4, colors: false }))).join(" "));
  },
  table: (data: any) => {
    try {
      logs.push(JSON.stringify(data, null, 2));
    } catch {
      logs.push(String(data));
    }
  },
  dir: (item: any) => {
    logs.push(util.inspect(item, { depth: 4, colors: false }));
  },
};

async function execute() {
  const { code, baseDir, worktree, sessionID, initialState } = workerData;
  const state = initialState || {};

  const resolvePath = (p: string) => {
    if (!p) return baseDir;
    const clean = p.replace(/\0/g, "");
    return path.isAbsolute(clean) ? path.normalize(clean) : path.normalize(path.resolve(baseDir, clean));
  };

  const fsSDK = {
    read: async (filePath: string, options: any = {}) => {
      const resolved = resolvePath(filePath);
      let content = await fs.readFile(resolved, options.encoding || "utf8");
      let truncatedByMaxBytes = false;
      if (options.maxBytes !== undefined && content.length > options.maxBytes) {
        content = content.slice(0, options.maxBytes);
        truncatedByMaxBytes = true;
      }
      if (options.startLine !== undefined || options.endLine !== undefined) {
        const lines = content.split("\n");
        const start = Math.max(1, options.startLine || 1) - 1;
        const end = options.endLine !== undefined ? Math.min(lines.length, options.endLine) : lines.length;
        return lines.slice(start, end).join("\n");
      }
      return truncatedByMaxBytes ? content + "\n... [output truncated by maxBytes]" : content;
    },
    write: async (filePath: string, content: string, options: any = {}) => {
      const resolved = resolvePath(filePath);
      const dir = path.dirname(resolved);
      if (options.createDirs !== false && !fsSync.existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }
      await fs.writeFile(resolved, content, options.encoding || "utf8");
    },
    edit: async (filePath: string, oldText: string, newText: string, options: any = {}) => {
      const resolved = resolvePath(filePath);
      const content = await fs.readFile(resolved, "utf8");
      if (!content.includes(oldText)) {
        throw new Error(`Target text to replace not found in: "${filePath}"`);
      }
      let updated: string;
      let occurrences = 0;
      if (options.allowMultiple) {
        const parts = content.split(oldText);
        occurrences = parts.length - 1;
        updated = parts.join(newText);
      } else {
        const first = content.indexOf(oldText);
        const last = content.lastIndexOf(oldText);
        if (first !== last) {
          throw new Error(
            `Multiple occurrences of target text found in "${filePath}". Set allowMultiple: true or specify unique text.`
          );
        }
        occurrences = 1;
        updated = content.replace(oldText, newText);
      }
      await fs.writeFile(resolved, updated, "utf8");
      return { filePath: resolved, replaced: true, occurrences };
    },
    exists: async (filePath: string) => {
      try {
        await fs.access(resolvePath(filePath));
        return true;
      } catch {
        return false;
      }
    },
    mkdir: async (dirPath: string) => {
      await fs.mkdir(resolvePath(dirPath), { recursive: true });
    },
    remove: async (filePath: string) => {
      const resolved = resolvePath(filePath);
      if (!fsSync.existsSync(resolved)) return false;
      await fs.rm(resolved, { recursive: true, force: true });
      return true;
    },
    stat: async (filePath: string) => {
      const s = await fs.stat(resolvePath(filePath));
      return {
        size: s.size,
        isFile: s.isFile(),
        isDirectory: s.isDirectory(),
        modifiedTime: s.mtime,
        createdTime: s.birthtime,
      };
    },
    list: async (dirPath = ".", recursive = false) => {
      const resolved = resolvePath(dirPath);
      const results: any[] = [];
      const MAX_ENTRIES = 10000;
      async function walk(curr: string) {
        if (results.length >= MAX_ENTRIES) return;
        const entries = await fs.readdir(curr, { withFileTypes: true });
        for (const e of entries) {
          if (results.length >= MAX_ENTRIES) return;
          const full = path.join(curr, e.name);
          const rel = path.relative(resolved, full).replace(/\\/g, "/");
          results.push({ name: e.name, path: rel, isDirectory: e.isDirectory(), isFile: e.isFile() });
          if (recursive && e.isDirectory() && !e.name.startsWith(".git") && e.name !== "node_modules") {
            await walk(full);
          }
        }
      }
      await walk(resolved);
      return results;
    },
  };

  const globToRegex = (glob: string) => {
    let p = glob
      .replace(/\\/g, "/")
      .replace(/\./g, "\\.")
      .replace(/\*\*\//g, "§§§")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]")
      .replace(/§§§/g, "(?:.*/)?");
    return new RegExp("^" + p + "$", "i");
  };

  const searchSDK = {
    glob: async (patterns: string | string[], options: any = {}) => {
      const cwd = options.cwd ? resolvePath(options.cwd) : baseDir;
      const patternList = Array.isArray(patterns) ? patterns : [patterns];
      const regexList = patternList.map(globToRegex);
      const ignoreList = (options.ignore || ["**/node_modules/**", "**/.git/**", "**/dist/**"]).map(globToRegex);
      const maxResults = options.maxResults || 1000;
      const matches: string[] = [];

      async function walk(current: string) {
        if (matches.length >= maxResults) return;
        let dirents: any[] = [];
        try {
          dirents = await fs.readdir(current, { withFileTypes: true });
        } catch {
          return;
        }
        for (const d of dirents) {
          if (matches.length >= maxResults) break;
          const full = path.join(current, d.name);
          const rel = path.relative(cwd, full).replace(/\\/g, "/");
          if (ignoreList.some((r) => r.test(rel) || r.test(d.name))) continue;
          if (d.isDirectory()) {
            if (!options.filesOnly && regexList.some((r) => r.test(rel) || r.test(d.name))) matches.push(rel);
            await walk(full);
          } else if (d.isFile()) {
            if (!options.directoriesOnly && regexList.some((r) => r.test(rel) || r.test(d.name))) matches.push(rel);
          }
        }
      }
      if (fsSync.existsSync(cwd)) await walk(cwd);
      return matches;
    },
    grep: async (query: string | RegExp, options: any = {}) => {
      const targetPath = options.path ? resolvePath(options.path) : baseDir;
      const maxResults = options.maxResults || 200;
      const results: any[] = [];
      const regex =
        query instanceof RegExp
          ? query
          : new RegExp(
              query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
              options.caseInsensitive !== false ? "i" : ""
            );

      const files: string[] = [];
      const st = await fs.stat(targetPath).catch(() => null);
      if (!st) return [];
      if (st.isFile()) {
        files.push(targetPath);
      } else {
        const found = await searchSDK.glob(options.glob || "**/*", {
          cwd: targetPath,
          ignore: options.ignore,
          filesOnly: true,
          maxResults: 2000,
        });
        for (const f of found) files.push(path.join(targetPath, f));
      }

      for (const file of files) {
        if (results.length >= maxResults) break;
        try {
          const content = await fs.readFile(file, "utf8");
          if (content.includes("\0") || content.length > 2 * 1024 * 1024) continue;
          const lines = content.split("\n");
          const rel = path.relative(baseDir, file).replace(/\\/g, "/");
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push({ file: rel, line: i + 1, content: lines[i].trimEnd() });
              if (results.length >= maxResults) break;
            }
          }
        } catch {}
      }
      return results;
    },
  };

  const bashSDK = async (cmd: string, options: any = {}) => {
    const cwd = options.cwd ? resolvePath(options.cwd) : baseDir;
    const timeout = options.timeout || 60000;
    const isWin = process.platform === "win32";
    const shell = options.shell || (isWin ? "powershell.exe" : "/bin/sh");
    const shellArgs =
      shell.includes("powershell") || shell.includes("pwsh")
        ? ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmd]
        : isWin
        ? ["/c", cmd]
        : ["-c", cmd];

    const start = Date.now();
    return new Promise((res, rej) => {
      const child = spawn(shell, shellArgs, { cwd, env: { ...process.env, ...options.env }, windowsHide: true });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        if (isWin) {
          try {
            spawn("taskkill", ["/F", "/T", "/PID", String(child.pid)], { windowsHide: true, stdio: "ignore" });
          } catch {}
        } else {
          try {
            child.kill("SIGKILL");
          } catch {}
        }
        rej(new Error("Command timed out after " + timeout + "ms: " + cmd));
      }, timeout);

      child.stdout?.on("data", (c) => (stdout += c.toString("utf8")));
      child.stderr?.on("data", (c) => (stderr += c.toString("utf8")));
      child.on("error", (e) => {
        clearTimeout(timer);
        rej(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        res({
          command: cmd,
          stdout: stdout.trimEnd(),
          stderr: stderr.trimEnd(),
          exitCode: code ?? 0,
          durationMs: Date.now() - start,
        });
      });
    });
  };
  (bashSDK as any).exec = bashSDK;

  const gitSDK = {
    isRepo: async () => {
      const r = (await bashSDK("git rev-parse --is-inside-work-tree")) as any;
      return r.exitCode === 0;
    },
    status: async () => {
      const r = (await bashSDK("git status --porcelain=v1 -b")) as any;
      if (r.exitCode !== 0) {
        return {
          isGitRepo: false,
          branch: null,
          staged: [],
          modified: [],
          untracked: [],
          deleted: [],
          isClean: false,
          error: r.stderr || r.stdout || "Not a git repository",
        };
      }
      const lines = r.stdout.split("\n").filter(Boolean);
      let branch = "HEAD";
      const staged: string[] = [],
        modified: string[] = [],
        untracked: string[] = [],
        deleted: string[] = [];
      for (const line of lines) {
        if (line.startsWith("##")) {
          branch = line.replace("##", "").trim().split("...")[0].trim();
          continue;
        }
        const x = line[0],
          y = line[1],
          file = line.slice(3).trim();
        if (x === "?" && y === "?") untracked.push(file);
        else {
          if (x !== " " && x !== "?") staged.push(file);
          if (y === "M") modified.push(file);
          if (y === "D" || x === "D") deleted.push(file);
        }
      }
      const isClean = staged.length === 0 && modified.length === 0 && untracked.length === 0 && deleted.length === 0;
      return { isGitRepo: true, branch, staged, modified, untracked, deleted, isClean };
    },
    diff: async (target?: string, staged = false) => {
      const args = ["git", "diff"];
      if (staged) args.push("--staged");
      if (target) args.push(target);
      const r = (await bashSDK(args.join(" "))) as any;
      return r.stdout;
    },
    log: async (max = 10) => {
      const r = (await bashSDK('git log -n ' + max + ' --pretty=format:"%H|%an|%ad|%s" --date=short')) as any;
      if (r.exitCode !== 0) return [];
      return r.stdout
        .split("\n")
        .filter(Boolean)
        .map((l: string) => {
          const [hash, author, date, message] = l.split("|");
          return { hash, author, date, message };
        });
    },
    branch: async () => {
      const r = (await bashSDK("git branch --show-current")) as any;
      return r.stdout.trim() || "HEAD";
    },
  };

  const sdk = {
    fs: fsSDK,
    search: searchSDK,
    bash: bashSDK,
    sh: bashSDK,
    $: bashSDK,
    git: gitSDK,
    read: fsSDK.read,
    write: fsSDK.write,
    edit: fsSDK.edit,
    exists: fsSDK.exists,
    glob: searchSDK.glob,
    grep: searchSDK.grep,
    exec: bashSDK,
    state,
    path,
    crypto,
    os,
    directory: baseDir,
    worktree: worktree || baseDir,
    sessionID,
  };

  const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFn(
    "sdk",
    "state",
    "console",
    "fs",
    "search",
    "bash",
    "sh",
    "$",
    "git",
    "read",
    "write",
    "edit",
    "exists",
    "glob",
    "grep",
    "exec",
    "path",
    "crypto",
    "os",
    "Buffer",
    "URL",
    "setTimeout",
    "clearTimeout",
    '"use strict"; return (async () => {\n' + code + "\n})();"
  );

  const result = await fn(
    sdk,
    state,
    customConsole,
    fsSDK,
    searchSDK,
    bashSDK,
    bashSDK,
    bashSDK,
    gitSDK,
    fsSDK.read,
    fsSDK.write,
    fsSDK.edit,
    fsSDK.exists,
    searchSDK.glob,
    searchSDK.grep,
    bashSDK,
    path,
    crypto,
    os,
    Buffer,
    URL,
    setTimeout,
    clearTimeout
  );

  return { success: true, result, logs, state };
}

if (parentPort) {
  execute()
    .then((res) => parentPort!.postMessage(res))
    .catch((err) => {
      parentPort!.postMessage({
        success: false,
        error: err?.message || String(err),
        stack: err?.stack,
        logs,
      });
    });
}
