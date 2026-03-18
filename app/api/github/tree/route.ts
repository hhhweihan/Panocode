import { NextRequest, NextResponse } from "next/server";
import { buildTree, parseGithubUrl } from "@/lib/github";

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
  const headers = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Panocode/1.0",
  };

  try {
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });

    if (!repoRes.ok) {
      if (repoRes.status === 404) {
        return NextResponse.json({ error: "Repository not found" }, { status: 404 });
      }
      if (repoRes.status === 403) {
        return NextResponse.json({ error: "Access denied or API rate limit exceeded" }, { status: 403 });
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
