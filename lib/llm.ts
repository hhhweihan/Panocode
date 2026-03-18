import { z } from "zod";

export const ChatCompletionsResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.union([
          z.string(),
          z.array(
            z.object({
              type: z.string().optional(),
              text: z.string().optional(),
            }),
          ),
        ]).optional(),
      }),
    }),
  ).optional(),
  error: z.object({ message: z.string() }).optional(),
});

export type ChatCompletionsResponse = z.infer<typeof ChatCompletionsResponseSchema>;

export type ProviderConfig = {
  provider: "github-models" | "llm";
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type ProviderAttempt = {
  config: ProviderConfig;
  status: number;
  message: string;
};

export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

export function extractText(content: string | { type?: string; text?: string }[] | undefined): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((part) => part.text ?? "").join("").trim();
  return "";
}

function buildProviderConfigs(preferGithubModels = false): ProviderConfig[] {
  const githubToken = process.env.GITHUB_TOKEN;
  const llmApiKey = process.env.LLM_API_KEY ?? process.env.GEMINI_API_KEY;

  const githubConfig = githubToken
    ? {
        provider: "github-models" as const,
        apiKey: githubToken,
        baseUrl: normalizeBaseUrl(process.env.GITHUB_MODELS_BASE_URL ?? "https://models.inference.ai.azure.com"),
        model: process.env.GITHUB_ENTRY_MODEL ?? "gpt-4o-mini",
      }
    : null;

  const llmConfig = llmApiKey
    ? {
        provider: "llm" as const,
        apiKey: llmApiKey,
        baseUrl: normalizeBaseUrl(process.env.LLM_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai"),
        model: process.env.LLM_MODEL ?? "gemini-2.0-flash",
      }
    : null;

  const configs: ProviderConfig[] = [];

  if (preferGithubModels && githubConfig) configs.push(githubConfig);
  if (llmConfig) configs.push(llmConfig);
  if (githubConfig && !configs.some((item) => item.provider === "github-models")) configs.push(githubConfig);

  return configs;
}

function shouldFallback(status: number, message: string) {
  if (status === 429) return true;
  if (status === 400 || status === 401 || status === 403) {
    return /(free tier|exhausted|quota|rate limit|insufficient|permission|models)/i.test(message);
  }
  return false;
}

function readErrorMessage(raw: ChatCompletionsResponse | null, status: number) {
  return raw?.error?.message ?? `LLM API request failed with status ${status}`;
}

export function formatProviderError(message: string) {
  if (/(free tier.*exhausted|use free tier only|quota.*exceeded|insufficient quota)/i.test(message)) {
    return `${message} Configure a paid-capable provider via LLM_API_KEY / LLM_BASE_URL / LLM_MODEL, or add GITHUB_TOKEN to enable GitHub Models fallback.`;
  }

  return message;
}

export async function requestChatCompletionsWithFallback(options: {
  payload: Record<string, unknown>;
  preferGithubModels?: boolean;
}) {
  const configs = buildProviderConfigs(options.preferGithubModels ?? process.env.GITHUB_USE_MODELS === "true");

  if (configs.length === 0) {
    throw new Error("LLM_API_KEY or GITHUB_TOKEN is not configured");
  }

  const attempts: ProviderAttempt[] = [];

  for (let index = 0; index < configs.length; index += 1) {
    const config = configs[index];
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...options.payload,
        model: config.model,
      }),
    });

    const json = await response.json().catch(() => ({}));
    const parsed = ChatCompletionsResponseSchema.safeParse(json);
    const raw = parsed.success ? parsed.data : null;

    if (response.ok) {
      return { response, raw, config, attempts };
    }

    const message = readErrorMessage(raw, response.status);
    attempts.push({ config, status: response.status, message });

    const hasMoreProviders = index < configs.length - 1;
    if (!hasMoreProviders || !shouldFallback(response.status, message)) {
      return { response, raw, config, attempts };
    }
  }

  throw new Error("LLM provider fallback failed unexpectedly");
}
