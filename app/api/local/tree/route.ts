// app/api/local/tree/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { LocalDataSource } from "@/lib/datasource/local";

export async function GET(req: NextRequest) {
  const localPath = req.nextUrl.searchParams.get("path");

  if (!localPath) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
  }

  const resolved = path.resolve(localPath);

  // Check path exists and is a directory
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "Path not found" }, { status: 404 });
  }

  try {
    const ds = new LocalDataSource(resolved);
    const { info, tree } = await ds.getTree();

    // Return synthetic RepoInfo-compatible flat fields alongside info and tree
    // This lets the analyze page use existing RepoInfo-typed state without widening the type
    return NextResponse.json({
      info,
      tree,
      // Synthetic RepoInfo fields
      owner: "",
      repo: info.name,
      branch: "",
      fullName: resolved,   // absolute path — used as dedup key in history
      description: null,
      homepage: null,
      primaryLanguage: null,
      license: null,
      topics: [],
      stars: undefined,
      forks: undefined,
      openIssues: undefined,
      updatedAt: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to read directory: ${msg}` }, { status: 500 });
  }
}
