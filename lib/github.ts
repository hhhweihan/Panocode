export interface TreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

export interface TreeNode {
  name: string;
  path: string;
  type: "blob" | "tree";
  sha?: string;
  children?: TreeNode[];
}

export interface RepoInfo {
  owner: string;
  repo: string;
  branch: string;
  fullName: string;
  description: string | null;
  homepage?: string | null;
  primaryLanguage?: string | null;
  license?: string | null;
  topics?: string[];
  forks?: number;
  openIssues?: number;
  updatedAt?: string | null;
  tree: TreeNode[];
}

export function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim().replace(/\/+$/, "");
  const patterns = [
    /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s?#]+)/,
    /^(?:www\.)?github\.com\/([^/\s]+)\/([^/\s?#]+)/,
    /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const owner = match[1];
      const repo = match[2].replace(/\.git$/, "");
      if (owner && repo) return { owner, repo };
    }
  }
  return null;
}

export function buildTree(items: TreeItem[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const root: TreeNode[] = [];

  const sorted = [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const item of sorted) {
    const parts = item.path.split("/");
    const name = parts[parts.length - 1];
    const node: TreeNode = {
      name,
      path: item.path,
      type: item.type,
      sha: item.sha,
      children: item.type === "tree" ? [] : undefined,
    };
    nodeMap.set(item.path, node);

    if (parts.length === 1) {
      root.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = nodeMap.get(parentPath);
      if (parent?.children) {
        parent.children.push(node);
      }
    }
  }
  return root;
}

export function getLanguageFromPath(path: string): string {
  const filename = path.split("/").pop()?.toLowerCase() || "";
  const ext = filename.includes(".") ? filename.split(".").pop() || "" : filename;

  const extMap: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rs: "rust", go: "go", java: "java", kt: "kotlin",
    cpp: "cpp", cc: "cpp", cxx: "cpp", c: "c", h: "c", cs: "csharp",
    rb: "ruby", php: "php", swift: "swift",
    md: "markdown", mdx: "markdown",
    json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
    css: "css", scss: "scss", less: "less", html: "html", htm: "html",
    xml: "xml", svg: "xml",
    sh: "bash", bash: "bash", zsh: "bash",
    sql: "sql", graphql: "graphql",
    lua: "lua", r: "r", dart: "dart",
    ex: "elixir", exs: "elixir",
    vue: "html", svelte: "html",
    tf: "hcl", hcl: "hcl",
    env: "bash", dockerfile: "dockerfile",
  };

  const filenameMap: Record<string, string> = {
    dockerfile: "dockerfile", makefile: "makefile",
    ".gitignore": "bash", ".env": "bash",
    "package.json": "json", "tsconfig.json": "json",
  };

  return filenameMap[filename] || extMap[ext] || "text";
}
