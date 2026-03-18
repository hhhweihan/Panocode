import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");
  const repo = req.nextUrl.searchParams.get("repo");
  const path = req.nextUrl.searchParams.get("path");
  const sha = req.nextUrl.searchParams.get("sha");

  if (!owner || !repo || !path || !sha) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Panocode/1.0",
      },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: `File not found: ${path}` }, { status: 404 });
      }
      if (res.status === 403) {
        return NextResponse.json({ error: "Access denied or API rate limit exceeded" }, { status: 403 });
      }
      return NextResponse.json({ error: "Failed to fetch file content" }, { status: res.status });
    }

    const data = await res.json() as { content?: string; encoding?: string };
    if (!data.content) {
      return NextResponse.json({ error: "File content is empty" }, { status: 404 });
    }

    const normalizedContent = data.content.replace(/\n/g, "");
    const content = data.encoding === "base64"
      ? Buffer.from(normalizedContent, "base64").toString("utf8")
      : normalizedContent;

    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: "Failed to fetch file content" }, { status: 500 });
  }
}
