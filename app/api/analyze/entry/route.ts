import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ChatCompletionsResponseSchema,
  extractText,
  formatProviderError,
  parseJsonObject,
  requestChatCompletionsWithFallback,
} from "@/lib/llm";

const AnalysisLocaleSchema = z.enum(["zh", "en"]);

const EntryResultSchema = z.object({
  isEntry: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string(),
});

export type EntryCheckResult = z.infer<typeof EntryResultSchema>;

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    repoUrl: string;
    repoName: string;
    description: string | null;
    languages: { name: string; percentage: number }[];
    filePath: string;
    fileContent: string;
    locale?: "zh" | "en";
  };

  const { repoUrl, repoName, description, languages, filePath, fileContent } = body;
  const locale = AnalysisLocaleSchema.catch("zh").parse(body.locale);

  const langSummary = languages
    .slice(0, 5)
    .map((l) => `${l.name} (${l.percentage}%)`)
    .join(", ");

  const languageInstruction = locale === "zh"
    ? "Write reason in Simplified Chinese. Keep code identifiers, framework names, and technical proper nouns in their original form when appropriate."
    : "Write reason in English.";

  const prompt = `You are analyzing a software project to determine if a specific file is the project's main entry point.

Project: ${repoName}
Location: ${repoUrl}
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
- Express/Fastify/Koa/NestJS/Flask/FastAPI server initialization that is actually started
- Django manage.py, wsgi.py, asgi.py, get_wsgi_application(), or exported app/application WSGI startup
- Go Gin/Echo/Fiber or net/http server startup that actually registers routes and starts serving
- PHP Laravel/Symfony front controller or route bootstrap such as public/index.php, artisan, or framework kernel bootstrap
- React/Vue root render / createApp call in the top-level index file
- CLI binary entry (#!/usr/bin/env shebang at top)
- Build bootstrap, not just re-exports

Return JSON only. No markdown fences. Exact shape:
{
  "isEntry": boolean,
  "confidence": "high" | "medium" | "low",
  "reason": "one or two sentences explaining the determination"
}

Language requirement:
- ${languageInstruction}`;

  try {
    const { response: res, raw } = await requestChatCompletionsWithFallback({
      payload: {
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
      },
      preferGithubModels: process.env.GITHUB_USE_MODELS === "true",
    });

    const parsedRaw = ChatCompletionsResponseSchema.parse(raw ?? {});

    if (!res.ok) {
      const msg = formatProviderError(parsedRaw.error?.message ?? "LLM API error");
      return NextResponse.json({ error: msg }, { status: res.status });
    }

    const text = extractText(parsedRaw.choices?.[0]?.message.content);
    if (!text) return NextResponse.json({ error: "Empty AI response" }, { status: 500 });

    const result = EntryResultSchema.parse(parseJsonObject(text));
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
