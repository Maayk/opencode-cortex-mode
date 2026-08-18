export interface ReadOptions {
  startLine?: number;
  endLine?: number;
  maxBytes?: number;
  encoding?: BufferEncoding;
}

export interface WriteOptions {
  overwrite?: boolean;
  createDirs?: boolean;
  encoding?: BufferEncoding;
}

export interface EditOptions {
  allowMultiple?: boolean;
}

export interface EditResult {
  filePath: string;
  replaced: boolean;
  occurrences: number;
}

export interface StatResult {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  modifiedTime: Date;
  createdTime: Date;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size?: number;
}

export interface FileSystemSDK {
  read(filePath: string, options?: ReadOptions): Promise<string>;
  write(filePath: string, content: string, options?: WriteOptions): Promise<void>;
  edit(filePath: string, oldText: string, newText: string, options?: EditOptions): Promise<EditResult>;
  exists(filePath: string): Promise<boolean>;
  mkdir(dirPath: string): Promise<void>;
  remove(filePath: string): Promise<boolean>;
  stat(filePath: string): Promise<StatResult>;
  list(dirPath?: string, recursive?: boolean): Promise<FileEntry[]>;
}

export interface GlobOptions {
  cwd?: string;
  ignore?: string[];
  maxResults?: number;
  filesOnly?: boolean;
  directoriesOnly?: boolean;
}

export interface GrepOptions {
  path?: string;
  glob?: string;
  ignore?: string[];
  caseInsensitive?: boolean;
  maxResults?: number;
  maxLineLength?: number;
}

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

export interface SearchSDK {
  glob(pattern: string | string[], options?: GlobOptions): Promise<string[]>;
  grep(query: string | RegExp, options?: GrepOptions): Promise<GrepMatch[]>;
}

export interface BashExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  maxBuffer?: number;
  shell?: string;
}

export interface BashExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  command: string;
}

export interface BashSDK {
  exec(command: string, options?: BashExecOptions): Promise<BashExecResult>;
  (command: string, options?: BashExecOptions): Promise<BashExecResult>;
}

export interface GitStatusResult {
  isGitRepo: boolean;
  branch: string | null;
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
  isClean: boolean;
  error?: string;
}

export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface GitSDK {
  status(): Promise<GitStatusResult>;
  diff(target?: string, staged?: boolean): Promise<string>;
  log(maxCount?: number): Promise<GitCommit[]>;
  branch(): Promise<string>;
  isRepo(): Promise<boolean>;
}

export interface CodeModeSDK {
  fs: FileSystemSDK;
  search: SearchSDK;
  bash: BashSDK;
  sh: BashSDK;
  $: BashSDK;
  git: GitSDK;
  read: FileSystemSDK["read"];
  write: FileSystemSDK["write"];
  edit: FileSystemSDK["edit"];
  exists: FileSystemSDK["exists"];
  glob: SearchSDK["glob"];
  grep: SearchSDK["grep"];
  exec: BashSDK["exec"];
  state: Record<string, any>;
  path: typeof import("node:path");
  crypto: typeof import("node:crypto");
  os: typeof import("node:os");
  directory: string;
  worktree: string;
  sessionID: string;
}

export interface ExecutionResult {
  success: boolean;
  output: string;
  logs: string[];
  result?: any;
  durationMs: number;
  error?: string;
  tokenSavedEstimate?: number;
}

export interface SandboxOptions {
  timeoutMs?: number;
  maxLogLines?: number;
  maxOutputChars?: number;
  maxOldGenerationSizeMb?: number;
  maxMemoryDeltaMb?: number;
  abortSignal?: AbortSignal;
}
