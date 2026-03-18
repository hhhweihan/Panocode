// lib/datasource/local.ts
import fs from "fs";
import path from "path";
import type { TreeNode } from "@/lib/github";
import type { ProjectInfo } from "@/lib/datasource/index";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  "out", "coverage", ".cache", "__pycache__", ".venv", "vendor",
]);

function walkDir(dir: string, root: string): TreeNode[] {
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  const dirs: TreeNode[] = [];
  const files: TreeNode[] = [];

  for (const dirent of dirents) {
    if (SKIP_DIRS.has(dirent.name)) continue;

    // Resolve and check for symlinks
    const fullPath = path.join(dir, dirent.name);
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink()) continue;

    const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");

    if (dirent.isDirectory()) {
      const children = walkDir(fullPath, root);
      dirs.push({
        name: dirent.name,
        path: relativePath,
        type: "tree",
        children,
      });
    } else if (dirent.isFile()) {
      files.push({
        name: dirent.name,
        path: relativePath,
        type: "blob",
      });
    }
  }

  // Sort: directories first, then files, both alphabetically
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return [...dirs, ...files];
}

export class LocalDataSource {
  private resolvedRoot: string;

  constructor(root: string) {
    this.resolvedRoot = path.resolve(root);
  }

  getTree(): { info: ProjectInfo; tree: TreeNode[] } {
    const tree = walkDir(this.resolvedRoot, this.resolvedRoot);
    const info: ProjectInfo = {
      name: path.basename(this.resolvedRoot),
      source: "local",
    };
    return { info, tree };
  }

  getFile(relativePath: string): string {
    const resolvedFile = path.resolve(this.resolvedRoot, relativePath);
    const rootWithSep = this.resolvedRoot + path.sep;

    if (
      resolvedFile !== this.resolvedRoot &&
      !resolvedFile.startsWith(rootWithSep)
    ) {
      throw Object.assign(new Error("Path traversal detected"), { code: "TRAVERSAL" });
    }

    const buf = fs.readFileSync(resolvedFile);
    // Binary file detection: null byte in first 8KB
    const sample = buf.slice(0, 8192);
    if (sample.includes(0)) return "";
    return buf.toString("utf8");
  }
}
