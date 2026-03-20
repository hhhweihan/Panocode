import type { TreeNode } from "@/lib/github";

export interface LocalArchiveData {
  key: string;
  name: string;
  tree: TreeNode[];
  files: Record<string, string>;
}

let archiveData: LocalArchiveData | null = null;

export function setArchive(data: LocalArchiveData): void {
  archiveData = data;
}

export function getArchive(): LocalArchiveData | null {
  return archiveData;
}

export function clearArchive(): void {
  archiveData = null;
}

export function getArchiveFileContent(filePath: string): string | null {
  if (!archiveData) {
    return null;
  }

  return archiveData.files[filePath] ?? null;
}