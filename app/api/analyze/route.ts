import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

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

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server" },
      { status: 500 }
    );
  }

  const body = await req.json() as { repoName: string; filePaths: string[] };
  const { repoName, filePaths } = body;

  if (!repoName || !Array.isArray(filePaths) || filePaths.length === 0) {
    return NextResponse.json({ error: "Missing repoName or filePaths" }, { status: 400 });
  }

  // Limit to 500 paths to stay within reasonable token budget
  const sample = filePaths.slice(0, 500);
  const truncated = filePaths.length > 500;

  const client = new Anthropic({ apiKey });

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

Use accurate hex colors for languages (e.g. TypeScript=#3178c6, JavaScript=#f7df1e, Python=#3572A5, Rust=#dea584, Go=#00ADD8, Java=#b07219, C++=f34b7d, CSS=#563d7c, HTML=#e34c26, Shell=#89e051).`;

  try {
    const response = await client.messages.parse({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
      output_config: {
        format: zodOutputFormat(AnalysisSchema),
      },
    });

    const result = response.parsed_output;
    if (!result) {
      return NextResponse.json({ error: "AI returned no result" }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Invalid ANTHROPIC_API_KEY" }, { status: 401 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "API rate limit exceeded, please try again later" }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `AI API error: ${err.message}` }, { status: 500 });
    }
    return NextResponse.json({ error: "Failed to analyze repository" }, { status: 500 });
  }
}
