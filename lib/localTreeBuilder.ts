// lib/localTreeBuilder.ts
// CLIENT-ONLY — uses FileSystemDirectoryHandle (browser API)

import type { TreeNode } from "@/lib/github";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  "out", "coverage", ".cache", "__pycache__", ".venv", "vendor",
]);

export async function buildLocalTree(
  dirHandle: FileSystemDirectoryHandle,
  relativePath = "",
): Promise<TreeNode[]> {
  const dirs: TreeNode[] = [];
  const files: TreeNode[] = [];

  for await (const entry of dirHandle.values()) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.kind === "directory") {
      const children = await buildLocalTree(
        entry as FileSystemDirectoryHandle,
        entryPath,
      );
      dirs.push({
        name: entry.name,
        path: entryPath,
        type: "tree",
        children,
      });
    } else {
      files.push({
        name: entry.name,
        path: entryPath,
        type: "blob",
      });
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return [...dirs, ...files];
}

export async function readLocalFile(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<string> {
  const parts = relativePath.split("/");
  let currentDir: FileSystemDirectoryHandle = rootHandle;

  for (let i = 0; i < parts.length - 1; i++) {
    currentDir = await currentDir.getDirectoryHandle(parts[i]);
  }

  const fileName = parts[parts.length - 1];
  const fileHandle = await currentDir.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.text();
}
