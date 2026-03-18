import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");
  const repo = req.nextUrl.searchParams.get("repo");
  const path = req.nextUrl.searchParams.get("path");
  const branch = req.nextUrl.searchParams.get("branch") || "main";

  if (!owner || !repo || !path) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    const res = await fetch(rawUrl, {
      headers: { "User-Agent": "Panocode/1.0" },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "File not found" }, { status: res.status });
    }

    const content = await res.text();
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: "Failed to fetch file content" }, { status: 500 });
  }
}
