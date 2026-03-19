import { NextRequest, NextResponse } from "next/server";
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

// ── Zod schemas ───────────────────────────────────────────────────────────────

const LocateResponseSchema = z.object({
  suggestedFiles: z.array(z.string()).max(5),
});

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let usage: LlmRequestUsage | null = null;
  const body = (await req.json()) as {
    repoName: string;
    functionName: string;
    callerFile: string;
    allFilePaths: string[];
    settings?: unknown;
  };

  const { repoName, functionName, callerFile, allFilePaths } = body;
  const { settings } = resolveRuntimeSettings({
    bodySettings: body.settings,
    headerSettings: req.headers.get("x-panocode-runtime-settings"),
  });
  const fileListSample = allFilePaths.slice(0, 300).join("\n");

  const prompt = `You are helping locate where a function is defined in a software project.

Project: ${repoName}
Function name: ${functionName}
Called from file: ${callerFile}

Repository file paths:
${fileListSample}

Based on the function name and the file it is called from, suggest up to 5 files (from the list above) that are most likely to contain the definition of "${functionName}".

Consider:
- Module naming conventions (e.g., parseUser is likely in user.ts, parser.ts, models/user.ts, etc.)
- Directory structure relative to the caller file
- Common patterns (utils/, helpers/, lib/, core/, services/, internal/, pkg/, src/, etc.)
- The function name prefix or suffix (e.g., "DB" suggests database module, "HTTP" suggests http module)
- If the function name is qualified like ClassName::FunctionName or Namespace::ClassName::FunctionName, consider both implementation files with the fully qualified definition and class/header files where the method may be declared inside the class body.
- If the function might be a class member, consider files defining the surrounding class even when the method is written directly inside class/struct declarations.

Return JSON only. No markdown fences. Exact shape:
{
  "suggestedFiles": ["path/to/file1.ts", "path/to/file2.ts"]
}`;

  try {
    const { response: res, raw, config, attempts } = await requestChatCompletionsWithFallback({
      payload: {
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You locate function definitions in source code repositories and return valid JSON only.",
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

    const parsed = LocateResponseSchema.parse(parseJsonObject(text));
    return NextResponse.json({ ...parsed, usage });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: `Invalid AI response: ${err.issues[0]?.message}`, usage },
        { status: 500 },
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Locate failed: ${msg}`, usage }, { status: 500 });
  }
}
