import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ChatCompletionsResponseSchema,
  extractText,
  formatProviderError,
  isAuthenticationError,
  isModelConfigurationError,
  requestChatCompletionsWithFallback,
} from "@/lib/llm";
import { resolveRuntimeSettings } from "@/lib/runtimeSettings";
import { buildLlmRequestUsage, type LlmRequestUsage } from "@/lib/usage";

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

const TECH_CATEGORY_VALUES = [
  "framework",
  "library",
  "language",
  "tool",
  "database",
  "platform",
  "testing",
  "devops",
  "other",
] as const;

type TechCategory = (typeof TECH_CATEGORY_VALUES)[number];

function normalizeTechCategory(value: unknown): TechCategory {
  if (typeof value !== "string") {
    return "other";
  }

  const normalized = value.trim().toLowerCase().replace(/[\s_/.-]+/g, "");

  switch (normalized) {
    case "framework":
    case "frameworks":
      return "framework";
    case "library":
    case "libraries":
    case "sdk":
    case "package":
    case "packages":
      return "library";
    case "language":
    case "languages":
      return "language";
    case "tool":
    case "tools":
    case "buildtool":
    case "buildtools":
    case "cli":
      return "tool";
    case "database":
    case "databases":
    case "db":
    case "storage":
      return "database";
    case "platform":
    case "platforms":
    case "runtime":
    case "hosting":
    case "cloud":
      return "platform";
    case "test":
    case "tests":
    case "testing":
    case "testframework":
    case "qa":
      return "testing";
    case "devops":
    case "infrastructure":
    case "infra":
    case "ci":
    case "cd":
    case "cicd":
    case "deployment":
      return "devops";
    case "other":
    case "misc":
    case "miscellaneous":
      return "other";
    default:
      return TECH_CATEGORY_VALUES.includes(normalized as TechCategory)
        ? (normalized as TechCategory)
        : "other";
  }
}

function normalizeAnalysisResult(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return raw;
  }

  const result = raw as {
    techStack?: Array<{ name?: unknown; category?: unknown }>;
  };

  return {
    ...result,
    techStack: Array.isArray(result.techStack)
      ? result.techStack.map((item) => ({
          ...item,
          category: normalizeTechCategory(item?.category),
        }))
      : result.techStack,
  };
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
  let usage: LlmRequestUsage | null = null;
  const body = await req.json() as {
    repoName: string;
    filePaths: string[];
    locale?: AnalysisLocale;
    settings?: unknown;
    repoContext?: {
      description?: string | null;
      homepage?: string | null;
      primaryLanguage?: string | null;
      license?: string | null;
      topics?: string[];
      branch?: string;
      stars?: number;
      forks?: number;
      openIssues?: number;
      updatedAt?: string | null;
    };
  };
  const { repoName, filePaths } = body;
  const locale = AnalysisLocaleSchema.catch("zh").parse(body.locale);
  const repoContext = body.repoContext;
  const { settings } = resolveRuntimeSettings({
    bodySettings: body.settings,
    headerSettings: req.headers.get("x-panocode-runtime-settings"),
  });

  if (!repoName || !Array.isArray(filePaths) || filePaths.length === 0) {
    return NextResponse.json({ error: "Missing repoName or filePaths" }, { status: 400 });
  }

  // Limit to 500 paths to stay within reasonable token budget
  const sample = filePaths.slice(0, 500);
  const truncated = filePaths.length > 500;

  const languageInstruction = locale === "zh"
    ? "Write summary and entryFiles.reason in Simplified Chinese. Keep technology and language proper names in their standard form when appropriate."
    : "Write summary and entryFiles.reason in English.";

  const repoDetails = [
    repoContext?.description ? `Description: ${repoContext.description}` : null,
    repoContext?.homepage ? `Homepage: ${repoContext.homepage}` : null,
    repoContext?.primaryLanguage ? `Primary language: ${repoContext.primaryLanguage}` : null,
    repoContext?.license ? `License: ${repoContext.license}` : null,
    repoContext?.branch ? `Default branch: ${repoContext.branch}` : null,
    typeof repoContext?.stars === "number" ? `Stars: ${repoContext.stars}` : null,
    typeof repoContext?.forks === "number" ? `Forks: ${repoContext.forks}` : null,
    typeof repoContext?.openIssues === "number" ? `Open issues: ${repoContext.openIssues}` : null,
    repoContext?.updatedAt ? `Last updated: ${repoContext.updatedAt}` : null,
    repoContext?.topics && repoContext.topics.length > 0 ? `Topics: ${repoContext.topics.join(", ")}` : null,
  ].filter(Boolean).join("\n");

  const prompt = `You are a software project analyzer. Analyze the file structure of this software project and return a structured analysis.

Repository: ${repoName}
${repoDetails ? `Repository details:\n${repoDetails}\n` : ""}
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
    const { response, raw, config, attempts } = await requestChatCompletionsWithFallback({
      payload: {
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
      },
      settings,
    });

    const rawData = ChatCompletionsResponseSchema.parse(raw ?? {});
    usage = buildLlmRequestUsage({
      config,
      attempts,
      raw: rawData,
      ok: response.ok,
    });

    if (!response.ok) {
      const message = formatProviderError(rawData.error?.message || "LLM API request failed");
      if (isAuthenticationError(response.status, message)) {
        return NextResponse.json({ error: `LLM API authentication failed: ${message}`, usage }, { status: response.status });
      }
      if (isModelConfigurationError(response.status, message)) {
        return NextResponse.json({ error: `LLM model configuration failed: ${message}`, usage }, { status: response.status });
      }
      if (response.status === 429) {
        return NextResponse.json({ error: "LLM API rate limit exceeded, please try again later", usage }, { status: 429 });
      }
      return NextResponse.json({ error: `LLM API error: ${message}`, usage }, { status: response.status });
    }

    const text = extractText(rawData.choices?.[0]?.message.content);

    if (!text) {
      return NextResponse.json({ error: "AI returned no result", usage }, { status: 500 });
    }

    const parsedJson = JSON.parse(extractJsonObject(text));
    const result = AnalysisSchema.parse(normalizeAnalysisResult(parsedJson));
    if (!result) {
      return NextResponse.json({ error: "AI returned no result", usage }, { status: 500 });
    }

    return NextResponse.json({ ...result, usage });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: `Invalid AI response format: ${err.issues[0]?.message || "unknown schema error"}`, usage }, { status: 500 });
    }

    if (err instanceof Error) {
      return NextResponse.json({ error: `Failed to analyze repository: ${err.message}`, usage }, { status: 500 });
    }

    return NextResponse.json({ error: "Failed to analyze repository", usage }, { status: 500 });
  }
}
