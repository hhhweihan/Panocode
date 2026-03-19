// lib/datasource/local.ts
import fs from "fs";
import path from "path";
import type { TreeNode } from "@/lib/github";
import type {
  DataSource,
  FileContentSearchMatch,
  FileContentSearchOptions,
  ProjectInfo,
} from "@/lib/datasource/index";

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

    // Skip symlinks using Dirent directly (no lstatSync needed)
    if (dirent.isSymbolicLink()) continue;

    const fullPath = path.join(dir, dirent.name);
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

function createSearchRegExp(query: RegExp | string, caseSensitive: boolean) {
  if (query instanceof RegExp) {
    const flags = query.flags.includes("g") ? query.flags : `${query.flags}g`;
    return new RegExp(query.source, caseSensitive ? flags.replace(/i/g, "") : flags.includes("i") ? flags : `${flags}i`);
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, caseSensitive ? "g" : "gi");
}

function flattenBlobPaths(tree: TreeNode[]): string[] {
  const paths: string[] = [];

  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.type === "blob") {
        paths.push(node.path);
        continue;
      }

      if (node.children) {
        walk(node.children);
      }
    }
  };

  walk(tree);
  return paths;
}

function collectMatches(
  content: string,
  filePath: string,
  matcher: RegExp,
  maxResults: number,
  results: FileContentSearchMatch[],
) {
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    matcher.lastIndex = 0;
    if (!matcher.test(lines[index])) {
      continue;
    }

    results.push({
      path: filePath,
      lineNumber: index + 1,
      line: lines[index],
    });

    if (results.length >= maxResults) {
      return;
    }
  }
}

export class LocalDataSource implements DataSource {
  private resolvedRoot: string;
  private cachedTree: TreeNode[] | null = null;

  constructor(root: string) {
    this.resolvedRoot = path.resolve(root);
  }

  async getTree(): Promise<{ info: ProjectInfo; tree: TreeNode[] }> {
    const tree = this.cachedTree ?? walkDir(this.resolvedRoot, this.resolvedRoot);
    this.cachedTree = tree;
    const info: ProjectInfo = {
      name: path.basename(this.resolvedRoot),
      source: "local",
      fullName: this.resolvedRoot,
    };
    return { info, tree };
  }

  async getFile(relativePath: string): Promise<string> {
    if (path.isAbsolute(relativePath)) {
      throw Object.assign(new Error("Absolute path not allowed"), { code: "TRAVERSAL" });
    }

    const resolvedFile = path.resolve(this.resolvedRoot, relativePath);
    const rootWithSep = this.resolvedRoot + path.sep;

    if (
      resolvedFile !== this.resolvedRoot &&
      !resolvedFile.startsWith(rootWithSep)
    ) {
      throw Object.assign(new Error("Path traversal detected"), { code: "TRAVERSAL" });
    }

    let buf: Buffer;
    try {
      buf = fs.readFileSync(resolvedFile);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") throw Object.assign(new Error("File not found"), { code: "ENOENT" });
      if (code === "EACCES") throw Object.assign(new Error("Permission denied"), { code: "EACCES" });
      throw err;
    }

    // Binary file detection: null byte in first 8KB
    const sample = buf.subarray(0, 8192);
    if (sample.includes(0)) return "";
    return buf.toString("utf8");
  }

  async searchFileContent(options: FileContentSearchOptions): Promise<FileContentSearchMatch[]> {
    const { tree } = await this.getTree();
    const matcher = createSearchRegExp(options.query, options.caseSensitive ?? false);
    const maxResults = options.maxResults ?? 20;
    const results: FileContentSearchMatch[] = [];

    for (const filePath of flattenBlobPaths(tree)) {
      let content: string;

      try {
        content = await this.getFile(filePath);
      } catch {
        continue;
      }

      collectMatches(content, filePath, matcher, maxResults, results);
      if (results.length >= maxResults) {
        break;
      }
    }

    return results;
  }
}
