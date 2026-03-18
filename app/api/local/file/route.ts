// app/api/local/file/route.ts
import { NextRequest, NextResponse } from "next/server";
import { LocalDataSource } from "@/lib/datasource/local";

export async function GET(req: NextRequest) {
  const root = req.nextUrl.searchParams.get("root");
  const file = req.nextUrl.searchParams.get("file");

  if (!root || !file) {
    return NextResponse.json({ error: "Missing root or file parameter" }, { status: 400 });
  }

  try {
    const ds = new LocalDataSource(root);
    const content = await ds.getFile(file);
    return NextResponse.json({ content });
  } catch (err) {
    if (err instanceof Error) {
      if ((err as NodeJS.ErrnoException).code === "TRAVERSAL") {
        return NextResponse.json({ error: "Path traversal detected" }, { status: 403 });
      }
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
