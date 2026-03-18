import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
});

const ExpandResponseSchema = z.object({
  children: z.array(CallgraphNodeSchema).max(20),
});

const ChatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.union([
            z.string(),
            z.array(z.object({ type: z.string().optional(), text: z.string().optional() })),
          ]).optional(),
        }),
      }),
    )
    .optional(),
  error: z.object({ message: z.string() }).optional(),
});

// ── Shared helpers ────────────────────────────────────────────────────────────

function normalizeBaseUrl(u: string) {
  return u.replace(/\/+$/, "");
}

function extractText(content: string | { type?: string; text?: string }[] | undefined): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((p) => p.text ?? "").join("").trim();
  return "";
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.LLM_API_KEY ?? process.env.GEMINI_API_KEY;
  const baseUrl = normalizeBaseUrl(
    process.env.LLM_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai",
  );
  const model = process.env.LLM_MODEL ?? "gemini-2.0-flash";

  if (!apiKey) {
    return NextResponse.json({ error: "LLM_API_KEY is not configured" }, { status: 500 });
  }

  const body = (await req.json()) as {
    repoName: string;
    functionName: string;
    filePath: string;
    functionSnippet: string;
    allFilePaths: string[];
    locale?: "zh" | "en";
  };

  const { repoName, functionName, filePath, functionSnippet, allFilePaths } = body;
  const locale = AnalysisLocaleSchema.catch("zh").parse(body.locale);
  const fileListSample = allFilePaths.slice(0, 300).join("\n");
  const languageInstruction = locale === "zh"
    ? "Write description in Simplified Chinese. Keep code identifiers, file paths, library names, and technical proper nouns in their standard original form when appropriate."
    : "Write description in English.";

  const prompt = `You are analyzing a specific function in a GitHub repository to identify its key direct callees.

Repository: ${repoName}
File: ${filePath}
Function: ${functionName}

Function snippet:
\`\`\`
${functionSnippet}
\`\`\`

Repository file paths (for locating callees):
${fileListSample}

Task: Identify up to 20 key functions, methods, or modules directly called from this function that are truly significant to understanding the project's core architecture and feature flow.

Strict filtering rules:
- Return only callees that meaningfully advance the core feature workflow, orchestrate important subsystems, or contain important domain logic.
- Do NOT return routine data-structure operations, container manipulation, string operations, formatting/parsing helpers, serialization/deserialization helpers, logging calls, trivial utility wrappers, getters/setters, constructors/destructors, or low-level library calls unless they are clearly central to the project's core behavior.
- Prefer fewer, higher-signal callees over exhaustive coverage.
- For object-oriented languages, return the fully qualified callable name when possible, for example ClassName::methodName, Namespace::ClassName::methodName, or ClassName.methodName.

For each one provide:
- name: the exact function/class/module name as it appears in source
- likelyFile: best-guess relative file path from the repo root (pick from the file list above; use null if purely external/stdlib/third-party)
- drillDown: 1 if this is a substantial internal sub-system worth further analysis, 0 if uncertain, -1 if trivial/external/stdlib
- description: one sentence explaining what it does

Language requirement:
- ${languageInstruction}

Return JSON only. No markdown fences. Exact shape:
{
  "children": [
    {
      "name": "string",
      "likelyFile": "string | null",
      "drillDown": -1 | 0 | 1,
      "description": "string"
    }
  ]
}`;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You analyze source code call graphs and return valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    const raw = ChatResponseSchema.parse(await res.json());

    if (!res.ok) {
      const msg = raw.error?.message ?? "LLM API error";
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const text = extractText(raw.choices?.[0]?.message.content);
    if (!text) return NextResponse.json({ error: "Empty AI response" }, { status: 500 });

    const parsed = ExpandResponseSchema.parse(JSON.parse(text));
    return NextResponse.json(parsed);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: `Invalid AI response: ${err.issues[0]?.message}` },
        { status: 500 },
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Expand analysis failed: ${msg}` }, { status: 500 });
  }
}
