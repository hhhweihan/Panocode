import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const EntryResultSchema = z.object({
  isEntry: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string(),
});

export type EntryCheckResult = z.infer<typeof EntryResultSchema>;

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
      })
    )
    .optional(),
  error: z.object({ message: z.string() }).optional(),
});

function normalizeBaseUrl(u: string) {
  return u.replace(/\/+$/, "");
}

function extractText(content: string | { type?: string; text?: string }[] | undefined): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((p) => p.text ?? "").join("").trim();
  return "";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.LLM_API_KEY ?? process.env.GEMINI_API_KEY;
  const baseUrl = normalizeBaseUrl(
    process.env.LLM_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai"
  );
  // Use a cheaper/faster model for per-file judgment
  const model = "gemini-3-flash-preview";

  if (!apiKey) {
    return NextResponse.json({ error: "LLM_API_KEY is not configured" }, { status: 500 });
  }

  const body = await req.json() as {
    repoUrl: string;
    repoName: string;
    description: string | null;
    languages: { name: string; percentage: number }[];
    filePath: string;
    fileContent: string;
  };

  const { repoUrl, repoName, description, languages, filePath, fileContent } = body;

  const langSummary = languages
    .slice(0, 5)
    .map((l) => `${l.name} (${l.percentage}%)`)
    .join(", ");

  const prompt = `You are analyzing a GitHub repository to determine if a specific file is the project's main entry point.

Repository: ${repoName}
URL: ${repoUrl}
Description: ${description ?? "N/A"}
Primary Languages: ${langSummary}

File being analyzed: ${filePath}

File content:
\`\`\`
${fileContent}
\`\`\`

Based on the file content and repository context, determine if this is the main entry point of the project.

Common entry point indicators:
- Contains main() / __main__ block / app startup code
- Express/Fastify/Flask/FastAPI server initialization that is actually started
- React/Vue root render / createApp call in the top-level index file
- CLI binary entry (#!/usr/bin/env shebang at top)
- Build bootstrap, not just re-exports

Return JSON only. No markdown fences. Exact shape:
{
  "isEntry": boolean,
  "confidence": "high" | "medium" | "low",
  "reason": "one or two sentences explaining the determination"
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
            content:
              "You analyze source code files to determine if they are project entry points. Return valid JSON only.",
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

    const result = EntryResultSchema.parse(JSON.parse(text));
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: `Invalid AI response: ${err.issues[0]?.message}` },
        { status: 500 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Entry analysis failed: ${msg}` }, { status: 500 });
  }
}
