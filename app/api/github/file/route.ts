import { NextRequest, NextResponse } from "next/server";
import { RUNTIME_SETTINGS_HEADER, resolveRuntimeSettings } from "@/lib/runtimeSettings";

function getGithubHeaders(githubToken?: string) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Panocode/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
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
  const owner = req.nextUrl.searchParams.get("owner");
  const repo = req.nextUrl.searchParams.get("repo");
  const path = req.nextUrl.searchParams.get("path");
  const sha = req.nextUrl.searchParams.get("sha");

  if (!owner || !repo || !path || !sha) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    const { settings } = resolveRuntimeSettings({
      headerSettings: req.headers.get(RUNTIME_SETTINGS_HEADER),
    });
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`, {
      headers: getGithubHeaders(settings.githubToken),
    });

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: `File not found: ${path}` }, { status: 404 });
      }
      if (res.status === 403) {
        return NextResponse.json({ error: getGithub403Message(res) }, { status: 403 });
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
