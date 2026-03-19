import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildEntryCallgraphPrompt, type CallgraphBridgeInfo } from "@/lib/callgraphBridge";
import {
  ChatCompletionsResponseSchema,
  extractText,
  formatProviderError,
  parseJsonObject,
  requestChatCompletionsWithFallback,
} from "@/lib/llm";
import { resolveRuntimeSettings } from "@/lib/runtimeSettings";

const AnalysisLocaleSchema = z.enum(["zh", "en"]);

const VALID_NODE_TYPES = ["function", "controller", "module", "framework"] as const;

function normalizeNullableString(value: unknown) {
  if (
    value === "" ||
    value === "null" ||
    value === "N/A" ||
    value === null ||
    typeof value === "undefined"
  ) {
    return null;
  }

  return typeof value === "string" ? value : String(value);
}

function normalizeDrillDown(value: unknown) {
  if (typeof value === "number" && (value === -1 || value === 0 || value === 1)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "-1" || normalized === "0" || normalized === "1") {
      return Number(normalized);
    }
    if (["external", "stdlib", "third-party", "thirdparty", "trivial"].includes(normalized)) {
      return -1;
    }
    if (["key", "important", "yes", "true", "internal"].includes(normalized)) {
      return 1;
    }
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  return 0;
}

function normalizeNodeType(value: unknown) {
  if (typeof value !== "string") {
    return "function";
  }

  const normalized = value.trim().toLowerCase();
  return VALID_NODE_TYPES.includes(normalized as (typeof VALID_NODE_TYPES)[number])
    ? normalized
    : "function";
}

function formatZodIssue(issue: z.ZodIssue) {
  const path = issue.path.length > 0 ? issue.path.join(".") : "response";
  return `${path}: ${issue.message}`;
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const CallgraphNodeSchema = z.object({
  name: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : "unknown"), z.string()),
  likelyFile: z.preprocess(normalizeNullableString, z.string().nullable()),
  drillDown: z.preprocess(normalizeDrillDown, z.union([z.literal(-1), z.literal(0), z.literal(1)])),
  description: z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string()),
  nodeType: z.preprocess(normalizeNodeType, z.enum(VALID_NODE_TYPES)),
  routePath: z.preprocess(normalizeNullableString, z.string().nullable()),
  bridgeNote: z.preprocess(normalizeNullableString, z.string().nullable()),
});

const CallgraphSchema = z.object({
  rootFunction: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : "entry"), z.string()),
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
    settings?: unknown;
    languages?: { name: string; percentage: number }[];
    techStack?: { name: string; category: string }[];
    summary?: string | null;
    description?: string | null;
    locale?: "zh" | "en";
  };

  const { repoName, filePath, fileContent, allFilePaths } = body;
  const locale = AnalysisLocaleSchema.catch("zh").parse(body.locale);
  const { settings } = resolveRuntimeSettings({
    bodySettings: body.settings,
    headerSettings: req.headers.get("x-panocode-runtime-settings"),
  });
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
      settings,
    });

    const parsedRaw = ChatCompletionsResponseSchema.parse(raw ?? {});

    if (!res.ok) {
      const msg = formatProviderError(parsedRaw.error?.message ?? "LLM API error");
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const text = extractText(parsedRaw.choices?.[0]?.message.content);
    if (!text) return NextResponse.json({ error: "Empty AI response" }, { status: 500 });

    const parsed = CallgraphSchema.parse(parseJsonObject(text));
    const result: CallgraphResult = {
      rootFunction: parsed.rootFunction,
      entryFile: filePath,
      children: parsed.children.slice(0, settings.criticalChildCount),
      bridge,
    };
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: `Invalid AI response: ${formatZodIssue(err.issues[0])}` },
        { status: 500 },
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Call graph analysis failed: ${msg}` }, { status: 500 });
  }
}
