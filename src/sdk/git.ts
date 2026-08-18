import type { GitSDK, GitStatusResult, GitCommit } from "../types.js";
import { createBashSDK } from "./bash.js";

export class GitSDKImpl implements GitSDK {
  private bash: ReturnType<typeof createBashSDK>;

  constructor(private baseDir: string) {
    this.bash = createBashSDK(baseDir);
  }

  async isRepo(): Promise<boolean> {
    const res = await this.bash("git rev-parse --is-inside-work-tree");
    return res.exitCode === 0;
  }

  async status(): Promise<GitStatusResult> {
    const res = await this.bash("git status --porcelain=v1 -b");
    if (res.exitCode !== 0) {
      return {
        isGitRepo: false,
        branch: null,
        staged: [],
        modified: [],
        untracked: [],
        deleted: [],
        isClean: false,
        error: res.stderr || res.stdout || "Not a git repository",
      };
    }

    const lines = res.stdout.split("\n").filter(Boolean);
    let branch = "HEAD";
    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];
    const deleted: string[] = [];

    for (const line of lines) {
      if (line.startsWith("##")) {
        const branchPart = line.replace("##", "").trim();
        branch = branchPart.split("...")[0].trim();
        continue;
      }
      const x = line[0];
      const y = line[1];
      const file = line.slice(3).trim();

      if (x === "?" && y === "?") {
        untracked.push(file);
      } else {
        if (x !== " " && x !== "?") staged.push(file);
        if (y === "M") modified.push(file);
        if (y === "D" || x === "D") deleted.push(file);
      }
    }

    const isClean = staged.length === 0 && modified.length === 0 && untracked.length === 0 && deleted.length === 0;

    return {
      isGitRepo: true,
      branch,
      staged,
      modified,
      untracked,
      deleted,
      isClean,
    };
  }

  async diff(target?: string, staged = false): Promise<string> {
    const args = ["git", "diff"];
    if (staged) args.push("--staged");
    if (target) args.push(target);
    const res = await this.bash(args.join(" "));
    return res.stdout;
  }

  async log(maxCount = 10): Promise<GitCommit[]> {
    const res = await this.bash(`git log -n ${maxCount} --pretty=format:"%H|%an|%ad|%s" --date=short`);
    if (res.exitCode !== 0) return [];
    const lines = res.stdout.split("\n").filter(Boolean);
    return lines.map((l) => {
      const [hash, author, date, message] = l.split("|");
      return { hash: hash || "", author: author || "", date: date || "", message: message || "" };
    });
  }

  async branch(): Promise<string> {
    const res = await this.bash("git branch --show-current");
    return res.stdout.trim() || "HEAD";
  }
}
