import JSZip from "jszip";
import type { TreeNode } from "@/lib/github";
import type { LocalArchiveData } from "@/lib/localArchiveStore";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  "out", "coverage", ".cache", "__pycache__", ".venv", "vendor", "__MACOSX",
]);

const textDecoder = new TextDecoder("utf-8", { fatal: false });

function normalizeZipPath(rawPath: string): string {
  return rawPath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function shouldSkipPath(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  return segments.some((segment) => SKIP_DIRS.has(segment));
}

function stripCommonRoot(paths: string[]): string[] {
  if (paths.length === 0) {
    return paths;
  }

  const firstSegments = paths.map((item) => item.split("/").filter(Boolean));
  const rootCandidate = firstSegments[0][0];
  if (!rootCandidate) {
    return paths;
  }

  const canStrip = firstSegments.every((segments) => segments.length > 1 && segments[0] === rootCandidate);
  if (!canStrip) {
    return paths;
  }

  return firstSegments.map((segments) => segments.slice(1).join("/"));
}

function ensureDirectoryNode(root: TreeNode[], nodeMap: Map<string, TreeNode>, dirPath: string): TreeNode {
  const existing = nodeMap.get(dirPath);
  if (existing) {
    return existing;
  }

  const parts = dirPath.split("/").filter(Boolean);
  const name = parts[parts.length - 1];
  const node: TreeNode = {
    name,
    path: dirPath,
    type: "tree",
    children: [],
  };

  nodeMap.set(dirPath, node);
  if (parts.length === 1) {
    root.push(node);
    return node;
  }

  const parentPath = parts.slice(0, -1).join("/");
  const parent = ensureDirectoryNode(root, nodeMap, parentPath);
  parent.children ??= [];
  parent.children.push(node);
  return node;
}

function buildTreeFromPaths(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  for (const filePath of [...paths].sort((a, b) => a.localeCompare(b))) {
    const parts = filePath.split("/").filter(Boolean);
    if (parts.length === 0) {
      continue;
    }

    if (parts.length > 1) {
      for (let index = 1; index < parts.length; index++) {
        const dirPath = parts.slice(0, index).join("/");
        ensureDirectoryNode(root, nodeMap, dirPath);
      }
    }

    const node: TreeNode = {
      name: parts[parts.length - 1],
      path: filePath,
      type: "blob",
    };

    nodeMap.set(filePath, node);
    if (parts.length === 1) {
      root.push(node);
      continue;
    }

    const parentPath = parts.slice(0, -1).join("/");
    const parent = ensureDirectoryNode(root, nodeMap, parentPath);
    parent.children ??= [];
    parent.children.push(node);
  }

  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "tree" ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

    for (const node of nodes) {
      if (node.children) {
        sortNodes(node.children);
      }
    }
  }

  sortNodes(root);
  return root;
}

function isBinaryContent(buffer: Uint8Array): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  for (const value of sample) {
    if (value === 0) {
      return true;
    }
  }

  return false;
}

function deriveArchiveName(fileName: string): string {
  return fileName.replace(/\.zip$/i, "") || fileName;
}

function createArchiveKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `archive-${crypto.randomUUID()}`;
  }

  return `archive-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function buildLocalArchive(file: File): Promise<LocalArchiveData> {
  const zip = await JSZip.loadAsync(file);
  const fileEntries = Object.values(zip.files).filter((entry) => !entry.dir);

  const normalizedPaths = fileEntries
    .map((entry) => normalizeZipPath(entry.name))
    .filter((entryPath) => entryPath.length > 0 && !shouldSkipPath(entryPath));

  const strippedPaths = stripCommonRoot(normalizedPaths);
  const files: Record<string, string> = {};

  await Promise.all(fileEntries.map(async (entry) => {
    const originalPath = normalizeZipPath(entry.name);
    if (!originalPath || shouldSkipPath(originalPath)) {
      return;
    }

    const index = normalizedPaths.indexOf(originalPath);
    const finalPath = index >= 0 ? strippedPaths[index] : originalPath;
    if (!finalPath) {
      return;
    }

    const content = await entry.async("uint8array");
    files[finalPath] = isBinaryContent(content) ? "" : textDecoder.decode(content);
  }));

  return {
    key: createArchiveKey(),
    name: deriveArchiveName(file.name),
    tree: buildTreeFromPaths(Object.keys(files)),
    files,
  };
}