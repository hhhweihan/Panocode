import { NextRequest, NextResponse } from "next/server";
import { buildTree, parseGithubUrl } from "@/lib/github";

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

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const parsed = parseGithubUrl(url);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid GitHub URL format" }, { status: 400 });
  }

  const { owner, repo } = parsed;
  const headers = getGithubHeaders();

  try {
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });

    if (!repoRes.ok) {
      if (repoRes.status === 404) {
        return NextResponse.json({ error: "Repository not found" }, { status: 404 });
      }
      if (repoRes.status === 403) {
        return NextResponse.json({ error: getGithub403Message(repoRes) }, { status: 403 });
      }
      return NextResponse.json({ error: "Failed to fetch repository info" }, { status: repoRes.status });
    }

    const repoData = await repoRes.json();
    const branch: string = repoData.default_branch;

    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers }
    );

    if (!treeRes.ok) {
      if (treeRes.status === 403) {
        return NextResponse.json({ error: getGithub403Message(treeRes) }, { status: 403 });
      }
      return NextResponse.json({ error: "Failed to fetch file tree" }, { status: treeRes.status });
    }

    const treeData = await treeRes.json();
    const tree = buildTree(treeData.tree ?? []);

    return NextResponse.json({
      owner,
      repo,
      branch,
      fullName: repoData.full_name as string,
      description: repoData.description as string | null,
      stars: repoData.stargazers_count as number,
      tree,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
