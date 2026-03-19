import { buildTree, parseGithubUrl, type TreeNode } from "@/lib/github";
import type {
  DataSource,
  FileContentSearchMatch,
  FileContentSearchOptions,
  ProjectInfo,
} from "@/lib/datasource/index";

type GithubTreeResponse = {
  tree?: Array<{
    path: string;
    mode: string;
    type: "blob" | "tree";
    sha: string;
    size?: number;
    url: string;
  }>;
};

type GithubRepoResponse = {
  default_branch: string;
  full_name: string;
  description: string | null;
  homepage: string | null;
  language: string | null;
  license?: {
    spdx_id?: string | null;
    name?: string | null;
  } | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  updated_at: string | null;
};

export class GithubDataSourceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GithubDataSourceError";
    this.status = status;
  }
}

function getGithubHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Panocode/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

function getGithub403Message(response: Response) {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const limit = response.headers.get("x-ratelimit-limit");
  const reset = response.headers.get("x-ratelimit-reset");
  const resource = response.headers.get("x-ratelimit-resource");

  const details: string[] = [];

  if (remaining !== null) {
    details.push(`remaining: ${remaining}`);
  }

  if (limit !== null) {
    details.push(`limit: ${limit}`);
  }

  if (reset) {
    const resetDate = new Date(Number(reset) * 1000);
    if (!Number.isNaN(resetDate.getTime())) {
      details.push(`reset: ${resetDate.toLocaleString("zh-CN", { hour12: false })}`);
    }
  }

  const detailText = details.length > 0 ? ` (${details.join(", ")})` : "";

  if (remaining === "0") {
    return `GitHub API rate limit exceeded${resource ? ` (${resource})` : ""}${detailText}`;
  }

  return `Access denied by GitHub API${detailText}`;
}

function createSearchRegExp(query: RegExp | string, caseSensitive: boolean) {
  if (query instanceof RegExp) {
    const flags = query.flags.includes("g") ? query.flags : `${query.flags}g`;
    return new RegExp(query.source, caseSensitive ? flags.replace(/i/g, "") : flags.includes("i") ? flags : `${flags}i`);
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, caseSensitive ? "g" : "gi");
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

function findNodeByPath(tree: TreeNode[], targetPath: string): TreeNode | null {
  for (const node of tree) {
    if (node.path === targetPath) {
      return node;
    }

    if (node.children) {
      const nested = findNodeByPath(node.children, targetPath);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
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

export class GithubDataSource implements DataSource {
  private readonly owner: string;
  private readonly repo: string;
  private cachedTree: TreeNode[] | null = null;
  private cachedInfo: ProjectInfo | null = null;

  constructor(owner: string, repo: string) {
    this.owner = owner;
    this.repo = repo;
  }

  static fromUrl(url: string) {
    const parsed = parseGithubUrl(url);
    if (!parsed) {
      throw new GithubDataSourceError("Invalid GitHub URL format", 400);
    }

    return new GithubDataSource(parsed.owner, parsed.repo);
  }

  async getTree(): Promise<{ info: ProjectInfo; tree: TreeNode[] }> {
    if (this.cachedInfo && this.cachedTree) {
      return { info: this.cachedInfo, tree: this.cachedTree };
    }

    const headers = getGithubHeaders();
    const repoRes = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}`, { headers });

    if (!repoRes.ok) {
      if (repoRes.status === 404) {
        throw new GithubDataSourceError("Repository not found", 404);
      }

      if (repoRes.status === 403) {
        throw new GithubDataSourceError(getGithub403Message(repoRes), 403);
      }

      throw new GithubDataSourceError("Failed to fetch repository info", repoRes.status);
    }

    const repoData = await repoRes.json() as GithubRepoResponse;
    const branch = repoData.default_branch;
    const treeRes = await fetch(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/trees/${branch}?recursive=1`,
      { headers },
    );

    if (!treeRes.ok) {
      if (treeRes.status === 403) {
        throw new GithubDataSourceError(getGithub403Message(treeRes), 403);
      }

      throw new GithubDataSourceError("Failed to fetch file tree", treeRes.status);
    }

    const treeData = await treeRes.json() as GithubTreeResponse;
    const tree = buildTree(treeData.tree ?? []);
    const info: ProjectInfo = {
      name: repoData.full_name,
      source: "github",
      owner: this.owner,
      repo: this.repo,
      branch,
      fullName: repoData.full_name,
      description: repoData.description,
      homepage: repoData.homepage ?? null,
      primaryLanguage: repoData.language ?? null,
      license: repoData.license?.spdx_id ?? repoData.license?.name ?? null,
      topics: Array.isArray(repoData.topics) ? repoData.topics : [],
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      openIssues: repoData.open_issues_count,
      updatedAt: repoData.updated_at,
    };

    this.cachedInfo = info;
    this.cachedTree = tree;
    return { info, tree };
  }

  async getFile(filePath: string): Promise<string> {
    const { tree } = await this.getTree();
    const node = findNodeByPath(tree, filePath);

    if (!node || node.type !== "blob" || !node.sha) {
      throw new GithubDataSourceError(`File not found: ${filePath}`, 404);
    }

    const res = await fetch(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/blobs/${node.sha}`,
      { headers: getGithubHeaders() },
    );

    if (!res.ok) {
      if (res.status === 404) {
        throw new GithubDataSourceError(`File not found: ${filePath}`, 404);
      }

      if (res.status === 403) {
        throw new GithubDataSourceError(getGithub403Message(res), 403);
      }

      throw new GithubDataSourceError("Failed to fetch file content", res.status);
    }

    const data = await res.json() as { content?: string; encoding?: string };
    if (!data.content) {
      throw new GithubDataSourceError("File content is empty", 404);
    }

    const normalizedContent = data.content.replace(/\n/g, "");
    return data.encoding === "base64"
      ? Buffer.from(normalizedContent, "base64").toString("utf8")
      : normalizedContent;
  }

  async searchFileContent(options: FileContentSearchOptions): Promise<FileContentSearchMatch[]> {
    const { tree } = await this.getTree();
    const maxResults = options.maxResults ?? 20;
    const matcher = createSearchRegExp(options.query, options.caseSensitive ?? false);
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