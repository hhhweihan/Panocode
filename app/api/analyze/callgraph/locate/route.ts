import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// ── Zod schemas ───────────────────────────────────────────────────────────────

const LocateResponseSchema = z.object({
  suggestedFiles: z.array(z.string()).max(5),
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
    callerFile: string;
    allFilePaths: string[];
  };

  const { repoName, functionName, callerFile, allFilePaths } = body;
  const fileListSample = allFilePaths.slice(0, 300).join("\n");

  const prompt = `You are helping locate where a function is defined in a GitHub repository.

Repository: ${repoName}
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
            content: "You locate function definitions in source code repositories and return valid JSON only.",
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

    const parsed = LocateResponseSchema.parse(JSON.parse(text));
    return NextResponse.json(parsed);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: `Invalid AI response: ${err.issues[0]?.message}` },
        { status: 500 },
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Locate failed: ${msg}` }, { status: 500 });
  }
}
