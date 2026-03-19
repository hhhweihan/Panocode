import type { TreeNode } from "@/lib/github";

export interface ProjectInfo {
  name: string;
  source: "github" | "local";
  description?: string | null;
  fullName?: string;
  // GitHub-only fields (undefined for local source)
  owner?: string;
  repo?: string;
  branch?: string;
  stars?: number;
  forks?: number;
  openIssues?: number;
  updatedAt?: string | null;
  primaryLanguage?: string | null;
  license?: string | null;
  topics?: string[];
  homepage?: string | null;
}

export interface FileContentSearchMatch {
  path: string;
  lineNumber: number;
  line: string;
}

export interface FileContentSearchOptions {
  query: RegExp | string;
  maxResults?: number;
  caseSensitive?: boolean;
}

export interface DataSource {
  getTree(): Promise<{ info: ProjectInfo; tree: TreeNode[] }>;
  getFile(path: string): Promise<string>;
  searchFileContent(options: FileContentSearchOptions): Promise<FileContentSearchMatch[]>;
}
