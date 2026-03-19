import { NextRequest, NextResponse } from "next/server";
import { GithubDataSource, GithubDataSourceError } from "@/lib/datasource/github";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    const datasource = GithubDataSource.fromUrl(url);
    const { info, tree } = await datasource.getTree();

    return NextResponse.json({
      source: "github",
      owner: info.owner,
      repo: info.repo,
      branch: info.branch,
      fullName: info.fullName,
      description: info.description ?? null,
      homepage: info.homepage ?? null,
      primaryLanguage: info.primaryLanguage ?? null,
      license: info.license ?? null,
      topics: info.topics ?? [],
      stars: info.stars,
      forks: info.forks,
      openIssues: info.openIssues,
      updatedAt: info.updatedAt ?? null,
      tree,
    });
  } catch (error) {
    if (error instanceof GithubDataSourceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
