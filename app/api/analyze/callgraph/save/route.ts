import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

const CallgraphNodeSchema: z.ZodType<{
  name: string;
  likelyFile: string | null;
  drillDown: -1 | 0 | 1;
  description: string;
  nodeType: "function" | "controller" | "module" | "framework";
  routePath: string | null;
  bridgeNote: string | null;
  children?: Array<{
    name: string;
    likelyFile: string | null;
    drillDown: -1 | 0 | 1;
    description: string;
    nodeType: "function" | "controller" | "module" | "framework";
    routePath: string | null;
    bridgeNote: string | null;
    children?: unknown[];
  }>;
}> = z.lazy(() => z.object({
  name: z.string(),
  likelyFile: z.string().nullable(),
  drillDown: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  description: z.string(),
  nodeType: z.union([
    z.literal("function"),
    z.literal("controller"),
    z.literal("module"),
    z.literal("framework"),
  ]),
  routePath: z.string().nullable(),
  bridgeNote: z.string().nullable(),
  children: z.array(CallgraphNodeSchema).optional(),
}));

const CallgraphResultSchema = z.object({
  rootFunction: z.string(),
  entryFile: z.string(),
  children: z.array(CallgraphNodeSchema),
  bridge: z.object({
    strategyId: z.string(),
    strategyName: z.string(),
    reason: z.string(),
    evidence: z.array(z.string()).optional(),
  }).nullable().optional(),
});

const SaveCallgraphSchema = z.object({
  repoName: z.string().min(1),
  repoUrl: z.string().url(),
  summary: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  locale: z.enum(["zh", "en"]).optional(),
  callgraphResult: CallgraphResultSchema,
});

function sanitizeFileName(input: string) {
  return input.replace(/[<>:"/\\|?*]+/g, "_").replace(/\s+/g, "-");
}

export async function POST(req: NextRequest) {
  try {
    const body = SaveCallgraphSchema.parse(await req.json());

    const outputDir = path.join(process.cwd(), "analysis-output");
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, `${sanitizeFileName(body.repoName)}.callgraph.json`);
    await fs.writeFile(
      outputPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          repoName: body.repoName,
          repoUrl: body.repoUrl,
          summary: body.summary ?? null,
          description: body.description ?? null,
          locale: body.locale ?? "zh",
          callgraph: body.callgraphResult,
        },
        null,
        2,
      ),
      "utf8",
    );

    return NextResponse.json({
      savedFilePath: path.relative(process.cwd(), outputPath).replace(/\\/g, "/"),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: `Invalid save payload: ${error.issues[0]?.message ?? "unknown error"}` },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Callgraph save failed: ${message}` }, { status: 500 });
  }
}
