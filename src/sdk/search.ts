import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type { SearchSDK, GlobOptions, GrepOptions, GrepMatch } from "../types.js";

function globToRegex(glob: string): RegExp {
  let p = glob
    .replace(/\\/g, "/")
    .replace(/\./g, "\\.")
    .replace(/\*\*\//g, "§§§")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/§§§/g, "(?:.*/)?");
  return new RegExp(`^${p}$`, "i");
}

export class SearchSDKImpl implements SearchSDK {
  constructor(private baseDir: string) {}

  private resolvePath(targetPath: string): string {
    if (path.isAbsolute(targetPath)) {
      return path.normalize(targetPath);
    }
    return path.normalize(path.resolve(this.baseDir, targetPath));
  }

  async glob(patterns: string | string[], options: GlobOptions = {}): Promise<string[]> {
    const cwd = options.cwd ? this.resolvePath(options.cwd) : this.baseDir;
    const patternList = Array.isArray(patterns) ? patterns : [patterns];
    const regexList = patternList.map((p) => globToRegex(p));
    const ignoreList = (options.ignore || ["**/node_modules/**", "**/.git/**", "**/dist/**"]).map((p) => globToRegex(p));
    const maxResults = options.maxResults || 1000;

    const matches: string[] = [];

    const walk = async (currentDir: string) => {
      if (matches.length >= maxResults) return;
      let dirents: fsSync.Dirent[] = [];
      try {
        dirents = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const dirent of dirents) {
        if (matches.length >= maxResults) break;
        const fullPath = path.join(currentDir, dirent.name);
        const relPath = path.relative(cwd, fullPath).replace(/\\/g, "/");

        const isIgnored = ignoreList.some((r) => r.test(relPath) || r.test(dirent.name));
        if (isIgnored) continue;

        if (dirent.isDirectory()) {
          if (!options.filesOnly) {
            if (regexList.some((r) => r.test(relPath) || r.test(dirent.name))) {
              matches.push(relPath);
            }
          }
          await walk(fullPath);
        } else if (dirent.isFile()) {
          if (!options.directoriesOnly) {
            if (regexList.some((r) => r.test(relPath) || r.test(dirent.name))) {
              matches.push(relPath);
            }
          }
        }
      }
    };

    if (fsSync.existsSync(cwd)) {
      await walk(cwd);
    }

    return matches;
  }

  async grep(query: string | RegExp, options: GrepOptions = {}): Promise<GrepMatch[]> {
    const targetPath = options.path ? this.resolvePath(options.path) : this.baseDir;
    const maxResults = options.maxResults || 200;
    const maxLineLength = options.maxLineLength || 500;
    const results: GrepMatch[] = [];

    const regex =
      query instanceof RegExp
        ? query
        : new RegExp(
            query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            options.caseInsensitive !== false ? "i" : ""
          );

    const filesToSearch: string[] = [];

    const stat = await fs.stat(targetPath).catch(() => null);
    if (!stat) return [];

    if (stat.isFile()) {
      filesToSearch.push(targetPath);
    } else {
      const globPattern = options.glob || "**/*";
      const files = await this.glob(globPattern, {
        cwd: targetPath,
        ignore: options.ignore,
        filesOnly: true,
        maxResults: 2000,
      });
      for (const f of files) {
        filesToSearch.push(path.join(targetPath, f));
      }
    }

    for (const file of filesToSearch) {
      if (results.length >= maxResults) break;
      try {
        const content = await fs.readFile(file, "utf8");
        // Skip binary or gigantic files (> 2MB)
        if (content.includes("\0") || content.length > 2 * 1024 * 1024) continue;

        const lines = content.split("\n");
        const relFile = path.relative(this.baseDir, file).replace(/\\/g, "/");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (regex.test(line)) {
            const trimmed = line.length > maxLineLength ? line.slice(0, maxLineLength) + "..." : line;
            results.push({
              file: relFile,
              line: i + 1,
              content: trimmed.trimEnd(),
            });
            if (results.length >= maxResults) break;
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return results;
  }
}
