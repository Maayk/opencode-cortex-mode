import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type { FileSystemSDK, ReadOptions, WriteOptions, EditOptions, EditResult, StatResult, FileEntry } from "../types.js";

export class FileSystemSDKImpl implements FileSystemSDK {
  constructor(private baseDir: string) {}

  private resolvePath(targetPath: string): string {
    if (!targetPath) return this.baseDir;
    // Strip null bytes
    const cleanPath = targetPath.replace(/\0/g, "");
    if (path.isAbsolute(cleanPath)) {
      return path.normalize(cleanPath);
    }
    return path.normalize(path.resolve(this.baseDir, cleanPath));
  }

  async read(filePath: string, options: ReadOptions = {}): Promise<string> {
    const resolved = this.resolvePath(filePath);
    const encoding = options.encoding || "utf8";

    if (!fsSync.existsSync(resolved)) {
      throw new Error(`File not found: "${filePath}" (resolved: ${resolved})`);
    }

    const content = await fs.readFile(resolved, { encoding });

    if (options.startLine !== undefined || options.endLine !== undefined) {
      const lines = content.split("\n");
      const start = Math.max(1, options.startLine || 1) - 1;
      const end = options.endLine !== undefined ? Math.min(lines.length, options.endLine) : lines.length;
      return lines.slice(start, end).join("\n");
    }

    if (options.maxBytes && content.length > options.maxBytes) {
      return content.slice(0, options.maxBytes) + `\n... [Content truncated at ${options.maxBytes} bytes] ...`;
    }

    return content;
  }

  async write(filePath: string, content: string, options: WriteOptions = {}): Promise<void> {
    const resolved = this.resolvePath(filePath);
    const dir = path.dirname(resolved);

    if (options.createDirs !== false && !fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }

    if (options.overwrite === false && fsSync.existsSync(resolved)) {
      throw new Error(`File already exists and overwrite is set to false: "${filePath}"`);
    }

    await fs.writeFile(resolved, content, { encoding: options.encoding || "utf8" });
  }

  async edit(filePath: string, oldText: string, newText: string, options: EditOptions = {}): Promise<EditResult> {
    const resolved = this.resolvePath(filePath);

    if (!fsSync.existsSync(resolved)) {
      throw new Error(`File not found for edit: "${filePath}"`);
    }

    const content = await fs.readFile(resolved, "utf8");

    if (!content.includes(oldText)) {
      throw new Error(
        `Target text to replace not found in "${filePath}". Ensure whitespace, line endings and indentation match exactly.`
      );
    }

    let updated: string;
    let occurrences = 0;

    if (options.allowMultiple) {
      const parts = content.split(oldText);
      occurrences = parts.length - 1;
      updated = parts.join(newText);
    } else {
      const firstIndex = content.indexOf(oldText);
      const lastIndex = content.lastIndexOf(oldText);
      if (firstIndex !== lastIndex) {
        throw new Error(
          `Multiple occurrences of target text found in "${filePath}". Set allowMultiple: true or specify a more specific chunk.`
        );
      }
      occurrences = 1;
      updated = content.replace(oldText, newText);
    }

    await fs.writeFile(resolved, updated, "utf8");

    return {
      filePath: resolved,
      replaced: true,
      occurrences,
    };
  }

  async exists(filePath: string): Promise<boolean> {
    const resolved = this.resolvePath(filePath);
    try {
      await fs.access(resolved);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    const resolved = this.resolvePath(dirPath);
    await fs.mkdir(resolved, { recursive: true });
  }

  async remove(filePath: string): Promise<boolean> {
    const resolved = this.resolvePath(filePath);
    if (!fsSync.existsSync(resolved)) return false;
    await fs.rm(resolved, { recursive: true, force: true });
    return true;
  }

  async stat(filePath: string): Promise<StatResult> {
    const resolved = this.resolvePath(filePath);
    const stats = await fs.stat(resolved);
    return {
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      modifiedTime: stats.mtime,
      createdTime: stats.birthtime,
    };
  }

  async list(dirPath = ".", recursive = false): Promise<FileEntry[]> {
    const resolved = this.resolvePath(dirPath);
    if (!fsSync.existsSync(resolved)) {
      throw new Error(`Directory not found: "${dirPath}"`);
    }

    const entries: FileEntry[] = [];

    const walk = async (currentDir: string) => {
      const dirents = await fs.readdir(currentDir, { withFileTypes: true });
      for (const dirent of dirents) {
        const full = path.join(currentDir, dirent.name);
        const rel = path.relative(resolved, full);
        const isDirectory = dirent.isDirectory();
        const isFile = dirent.isFile();

        entries.push({
          name: dirent.name,
          path: rel.replace(/\\/g, "/"),
          isDirectory,
          isFile,
        });

        if (recursive && isDirectory && !dirent.name.startsWith(".git") && dirent.name !== "node_modules") {
          await walk(full);
        }
      }
    };

    await walk(resolved);
    return entries;
  }
}
