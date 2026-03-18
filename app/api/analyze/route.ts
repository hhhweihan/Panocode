import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const AnalysisLocaleSchema = z.enum(["zh", "en"]);

const AnalysisSchema = z.object({
  languages: z
    .array(
      z.object({
        name: z.string().describe("Programming language name"),
        percentage: z.number().describe("Estimated percentage of codebase (0-100)"),
        color: z.string().describe("Hex color code for this language, e.g. #3178c6"),
      })
    )
    .describe("Programming languages used, sorted by percentage descending"),
  techStack: z
    .array(
      z.object({
        name: z.string().describe("Technology name"),
        category: z
          .enum(["framework", "library", "language", "tool", "database", "platform", "testing", "devops", "other"])
          .describe("Category of technology"),
      })
    )
    .describe("Frameworks, libraries, and tools detected in the project"),
  entryFiles: z
    .array(
      z.object({
        path: z.string().describe("File path relative to repo root"),
        reason: z.string().describe("Brief reason why this is likely an entry point"),
      })
    )
    .describe("Probable main entry files (max 5)"),
  summary: z
    .string()
    .describe("One or two sentence description of what this project is and does"),
});

export type AnalysisResult = z.infer<typeof AnalysisSchema>;
export type AnalysisLocale = z.infer<typeof AnalysisLocaleSchema>;

const ChatCompletionsResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.union([
          z.string(),
          z.array(
            z.object({
              type: z.string().optional(),
              text: z.string().optional(),
            })
          ),
        ]).optional(),
      }),
    })
  ).optional(),
  error: z.object({
    message: z.string(),
  }).optional(),
});

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function getMessageText(content: string | { type?: string; text?: string }[] | undefined) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => part.text || "")
      .join("")
      .trim();
  }

  return "";
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch?.[1]?.trim() || trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Model did not return a JSON object");
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.LLM_API_KEY ?? process.env.GEMINI_API_KEY;
  const baseUrl = normalizeBaseUrl(
    process.env.LLM_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai"
  );
  const model = process.env.LLM_MODEL ?? "gemini3-flash-preview";

  if (!apiKey) {
    return NextResponse.json(
      { error: "LLM_API_KEY is not configured on the server" },
      { status: 500 }
    );
  }

  const body = await req.json() as { repoName: string; filePaths: string[]; locale?: AnalysisLocale };
  const { repoName, filePaths } = body;
  const locale = AnalysisLocaleSchema.catch("zh").parse(body.locale);

  if (!repoName || !Array.isArray(filePaths) || filePaths.length === 0) {
    return NextResponse.json({ error: "Missing repoName or filePaths" }, { status: 400 });
  }

  // Limit to 500 paths to stay within reasonable token budget
  const sample = filePaths.slice(0, 500);
  const truncated = filePaths.length > 500;

  const languageInstruction = locale === "zh"
    ? "Write summary and entryFiles.reason in Simplified Chinese. Keep technology and language proper names in their standard form when appropriate."
    : "Write summary and entryFiles.reason in English.";

  const prompt = `You are a software project analyzer. Analyze the file structure of this GitHub repository and return a structured analysis.

Repository: ${repoName}
Total code files${truncated ? ` (showing first 500 of ${filePaths.length})` : ""}: ${sample.length}

File paths:
${sample.join("\n")}

Based on the file extensions, directory structure, and naming conventions, analyze:
1. The programming languages used and their estimated proportions
2. The frameworks, libraries, and tools used
3. The most likely main entry file(s)
4. A brief summary of what this project appears to be

Use accurate hex colors for languages (e.g. TypeScript=#3178c6, JavaScript=#f7df1e, Python=#3572A5, Rust=#dea584, Go=#00ADD8, Java=#b07219, C++=#f34b7d, CSS=#563d7c, HTML=#e34c26, Shell=#89e051).
${languageInstruction}

Return JSON only. Do not wrap in markdown fences. Follow this exact shape:
{
  "languages": [{ "name": string, "percentage": number, "color": string }],
  "techStack": [{ "name": string, "category": "framework" | "library" | "language" | "tool" | "database" | "platform" | "testing" | "devops" | "other" }],
  "entryFiles": [{ "path": string, "reason": string }],
  "summary": string
}`;

  try {
    const response = await fetch(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: "You analyze repository file structures and must return valid JSON only.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      }
    );

    const rawData = ChatCompletionsResponseSchema.parse(await response.json());

    if (!response.ok) {
      const message = rawData.error?.message || "LLM API request failed";
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return NextResponse.json({ error: `LLM API authentication failed: ${message}` }, { status: response.status });
      }
      if (response.status === 429) {
        return NextResponse.json({ error: "LLM API rate limit exceeded, please try again later" }, { status: 429 });
      }
      return NextResponse.json({ error: `LLM API error: ${message}` }, { status: response.status });
    }

    const text = getMessageText(rawData.choices?.[0]?.message.content);

    if (!text) {
      return NextResponse.json({ error: "AI returned no result" }, { status: 500 });
    }

    const result = AnalysisSchema.parse(JSON.parse(extractJsonObject(text)));
    if (!result) {
      return NextResponse.json({ error: "AI returned no result" }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: `Invalid AI response format: ${err.issues[0]?.message || "unknown schema error"}` }, { status: 500 });
    }

    if (err instanceof Error) {
      return NextResponse.json({ error: `Failed to analyze repository: ${err.message}` }, { status: 500 });
    }

    return NextResponse.json({ error: "Failed to analyze repository" }, { status: 500 });
  }
}
