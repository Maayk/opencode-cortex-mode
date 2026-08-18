import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import type { CodeModeSDK } from "../types.js";
import { FileSystemSDKImpl } from "./fs.js";
import { SearchSDKImpl } from "./search.js";
import { createBashSDK } from "./bash.js";
import { GitSDKImpl } from "./git.js";
import { SessionStateManager } from "../runtime/state.js";

export function createCodeModeSDK(options: {
  directory: string;
  worktree?: string;
  sessionID?: string;
}): CodeModeSDK {
  const directory = path.normalize(options.directory || process.cwd());
  const worktree = path.normalize(options.worktree || directory);
  const sessionID = options.sessionID || "default";

  const fs = new FileSystemSDKImpl(directory);
  const search = new SearchSDKImpl(directory);
  const bash = createBashSDK(directory);
  const git = new GitSDKImpl(directory);
  const state = SessionStateManager.getInstance().getState(sessionID);

  const sdk: CodeModeSDK = {
    fs,
    search,
    bash,
    sh: bash,
    $: bash,
    git,
    read: fs.read.bind(fs),
    write: fs.write.bind(fs),
    edit: fs.edit.bind(fs),
    exists: fs.exists.bind(fs),
    glob: search.glob.bind(search),
    grep: search.grep.bind(search),
    exec: bash.exec.bind(bash),
    state,
    path,
    crypto,
    os,
    directory,
    worktree,
    sessionID,
  };

  return sdk;
}
