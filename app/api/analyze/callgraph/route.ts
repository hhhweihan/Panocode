import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildEntryCallgraphPrompt, type CallgraphBridgeInfo } from "@/lib/callgraphBridge";
import {
  ChatCompletionsResponseSchema,
  extractText,
  formatProviderError,
  requestChatCompletionsWithFallback,
} from "@/lib/llm";

const AnalysisLocaleSchema = z.enum(["zh", "en"]);

// ── Zod schemas ───────────────────────────────────────────────────────────────

const CallgraphNodeSchema = z.object({
  name: z.string(),
  likelyFile: z.preprocess(
    (v) => (v === "" || v === "null" || v === "N/A" || v === null ? null : v),
    z.string().nullable(),
  ),
  drillDown: z.preprocess(
    (v) => (typeof v === "string" ? parseInt(v, 10) : v),
    z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  ),
  description: z.string(),
  nodeType: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : "function"),
    z.union([
      z.literal("function"),
      z.literal("controller"),
      z.literal("module"),
      z.literal("framework"),
    ]),
  ),
  routePath: z.preprocess(
    (v) => (v === "" || v === "null" || v === "N/A" || v === null || typeof v === "undefined" ? null : v),
    z.string().nullable(),
  ),
  bridgeNote: z.preprocess(
    (v) => (v === "" || v === "null" || v === "N/A" || v === null || typeof v === "undefined" ? null : v),
    z.string().nullable(),
  ),
});

const CallgraphSchema = z.object({
  rootFunction: z.string(),
  children: z.array(CallgraphNodeSchema).max(20),
});

export type CallgraphNode = z.infer<typeof CallgraphNodeSchema> & {
  children?: CallgraphNode[]; // reserved for future recursive analysis
};

export type CallgraphResult = {
  rootFunction: string;
  entryFile: string;
  children: CallgraphNode[];
  bridge?: CallgraphBridgeInfo | null;
};

// ── Shared helpers ────────────────────────────────────────────────────────────

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    repoName: string;
    filePath: string;
    fileContent: string;
    allFilePaths: string[];
    languages?: { name: string; percentage: number }[];
    techStack?: { name: string; category: string }[];
    summary?: string | null;
    description?: string | null;
    locale?: "zh" | "en";
  };

  const { repoName, filePath, fileContent, allFilePaths } = body;
  const locale = AnalysisLocaleSchema.catch("zh").parse(body.locale);
  const languageInstruction = locale === "zh"
    ? "Write description in Simplified Chinese. Keep code identifiers, file paths, library names, and technical proper nouns in their standard original form when appropriate."
    : "Write description in English.";

  const { prompt, bridge } = buildEntryCallgraphPrompt(
    {
      repoName,
      filePath,
      fileContent,
      allFilePaths,
      locale,
      languages: body.languages,
      techStack: body.techStack,
      summary: body.summary,
      description: body.description,
    },
    languageInstruction,
  );

  try {
    const { response: res, raw } = await requestChatCompletionsWithFallback({
      payload: {
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You analyze source code call graphs and return valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
      },
    });

    const parsedRaw = ChatCompletionsResponseSchema.parse(raw ?? {});

    if (!res.ok) {
      const msg = formatProviderError(parsedRaw.error?.message ?? "LLM API error");
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const text = extractText(parsedRaw.choices?.[0]?.message.content);
    if (!text) return NextResponse.json({ error: "Empty AI response" }, { status: 500 });

    const parsed = CallgraphSchema.parse(JSON.parse(text));
    const result: CallgraphResult = {
      rootFunction: parsed.rootFunction,
      entryFile: filePath,
      children: parsed.children,
      bridge,
    };
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: `Invalid AI response: ${err.issues[0]?.message}` },
        { status: 500 },
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Call graph analysis failed: ${msg}` }, { status: 500 });
  }
}
