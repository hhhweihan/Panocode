import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  ChatCompletionsResponseSchema,
  extractText,
  formatProviderError,
  parseJsonObject,
  requestChatCompletionsWithFallback,
} from "@/lib/llm";
import { resolveRuntimeSettings } from "@/lib/runtimeSettings";
import { buildLlmRequestUsage, type LlmRequestUsage } from "@/lib/usage";
import {
  MODULE_COLOR_PALETTE,
  type FunctionModule,
  type ModuleAnalysisResult,
} from "@/lib/moduleAnalysis";

const ModuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  functions: z.array(z.string()).min(1),
});

const ModuleResponseSchema = z.object({
  modules: z.array(ModuleSchema).max(10),
});

function sanitizeFileName(input: string) {
  return input.replace(/[<>:"/\\|?*]+/g, "_").replace(/\s+/g, "-");
}

function normalizeModules(
  modules: z.infer<typeof ModuleSchema>[],
  functionNames: string[],
): FunctionModule[] {
  const knownNames = new Set(functionNames);
  const usedNames = new Set<string>();

  const normalized = modules.map((moduleItem, index) => {
    const functions = moduleItem.functions.filter((name) => {
      if (!knownNames.has(name) || usedNames.has(name)) return false;
      usedNames.add(name);
      return true;
    });

    return {
      id: moduleItem.id || `module-${index + 1}`,
      name: moduleItem.name,
      description: moduleItem.description,
      color: MODULE_COLOR_PALETTE[index % MODULE_COLOR_PALETTE.length],
      functions,
    } satisfies FunctionModule;
  }).filter((moduleItem) => moduleItem.functions.length > 0);

  const missing = functionNames.filter((name) => !usedNames.has(name));
  if (missing.length > 0) {
    if (normalized.length < 10) {
      normalized.push({
        id: "module-other",
        name: "Other",
        description: "Functions that could not be confidently grouped into another module.",
        color: MODULE_COLOR_PALETTE[normalized.length % MODULE_COLOR_PALETTE.length],
        functions: missing,
      });
    } else {
      normalized[normalized.length - 1].functions.push(...missing);
    }
  }

  return normalized;
}

function buildAssignments(modules: FunctionModule[]) {
  return Object.fromEntries(
    modules.flatMap((moduleItem) =>
      moduleItem.functions.map((functionName) => [
        functionName,
        {
          functionName,
          moduleId: moduleItem.id,
          moduleName: moduleItem.name,
          color: moduleItem.color,
        },
      ])
    )
  );
}

export async function POST(req: NextRequest) {
  let usage: LlmRequestUsage | null = null;
  const body = (await req.json()) as {
    repoName: string;
    repoUrl: string;
    locale?: "zh" | "en";
    summary?: string | null;
    description?: string | null;
    settings?: unknown;
    languages: { name: string; percentage: number }[];
    techStack: { name: string; category: string }[];
    functions: {
      name: string;
      description: string;
      likelyFile: string | null;
      drillDown: number;
      depth: number;
      parentFunction: string | null;
    }[];
  };

  const { repoName, repoUrl, summary, description, languages, techStack, functions } = body;
  const locale = body.locale ?? "zh";
  const functionNames = functions.map((item) => item.name);
  const { settings } = resolveRuntimeSettings({
    bodySettings: body.settings,
    headerSettings: req.headers.get("x-panocode-runtime-settings"),
  });

  const languageInstruction = locale === "zh"
    ? "Write module names and descriptions in Simplified Chinese when appropriate."
    : "Write module names and descriptions in English.";

  const prompt = `You are analyzing a software project's full function call panorama and need to group all analyzed functions into high-level functional modules.

Project: ${repoName}
Location: ${repoUrl}
Project description: ${description ?? "N/A"}
Project summary: ${summary ?? "N/A"}
Languages: ${languages.map((item) => `${item.name} (${item.percentage}%)`).join(", ")}
Tech stack: ${techStack.map((item) => `${item.name} [${item.category}]`).join(", ")}

Analyzed functions:
${functions.map((item) => `- ${item.name} | depth=${item.depth} | file=${item.likelyFile ?? "N/A"} | parent=${item.parentFunction ?? "ROOT"} | drill=${item.drillDown} | ${item.description}`).join("\n")}

Task:
1. Group ALL listed functions into no more than 10 functional modules.
2. Each function must appear exactly once in exactly one module.
3. Keep modules architecture-oriented, not overly granular.
4. Use concise module names and one-sentence descriptions.

${languageInstruction}

Return JSON only. Exact shape:
{
  "modules": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "functions": ["functionName1", "functionName2"]
    }
  ]
}`;

  try {
    const { response: res, raw, config, attempts } = await requestChatCompletionsWithFallback({
      payload: {
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You analyze function call graphs and return valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
      },
      settings,
    });

    const parsedRaw = ChatCompletionsResponseSchema.parse(raw ?? {});
    usage = buildLlmRequestUsage({
      config,
      attempts,
      raw: parsedRaw,
      ok: res.ok,
    });

    if (!res.ok) {
      const msg = formatProviderError(parsedRaw.error?.message ?? "LLM API error");
      return NextResponse.json({ error: msg, usage }, { status: res.status });
    }

    const text = extractText(parsedRaw.choices?.[0]?.message.content);
    if (!text) return NextResponse.json({ error: "Empty AI response", usage }, { status: 500 });

    const parsed = ModuleResponseSchema.parse(parseJsonObject(text));
    const modules = normalizeModules(parsed.modules, functionNames);
    const result: ModuleAnalysisResult = {
      modules,
      assignments: buildAssignments(modules),
    };

    const outputDir = path.join(process.cwd(), "analysis-output");
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, `${sanitizeFileName(repoName)}.module-analysis.json`);
    await fs.writeFile(outputPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      repoName,
      repoUrl,
      summary,
      description,
      languages,
      techStack,
      modules: result.modules,
      assignments: result.assignments,
    }, null, 2), "utf8");

    result.savedFilePath = path.relative(process.cwd(), outputPath).replace(/\\/g, "/");
    return NextResponse.json({ ...result, usage });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: `Invalid AI response: ${err.issues[0]?.message}`, usage },
        { status: 500 },
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Module analysis failed: ${msg}`, usage }, { status: 500 });
  }
}