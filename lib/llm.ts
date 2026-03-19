import { z } from "zod";
import { sanitizeRuntimeSettingsInput, type RuntimeSettings } from "@/lib/runtimeSettings";


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
  usage: z.object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
  }).optional(),
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

function parseModelList(value: string | undefined) {
  if (!value) return [];

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function extractText(content: string | { type?: string; text?: string }[] | undefined): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((part) => part.text ?? "").join("").trim();
  return "";
}

export function extractJsonObjectText(text: string) {
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

export function parseJsonObject<T>(text: string): T {
  return JSON.parse(extractJsonObjectText(text)) as T;
}

function buildProviderConfigs(
  preferGithubModels = false,
  overrides?: Partial<RuntimeSettings>,
): ProviderConfig[] {
  const githubToken = overrides?.githubToken || process.env.GITHUB_TOKEN;
  const llmApiKey = overrides?.aiApiKey || process.env.LLM_API_KEY || process.env.GEMINI_API_KEY;
  const githubModels = parseModelList(process.env.GITHUB_ENTRY_MODEL).length > 0
    ? parseModelList(process.env.GITHUB_ENTRY_MODEL)
    : ["gpt-4o-mini"];
  const llmModels = parseModelList(overrides?.aiModel || process.env.LLM_MODEL).length > 0
    ? parseModelList(overrides?.aiModel || process.env.LLM_MODEL)
    : ["gemini-2.0-flash"];

  const githubConfigs = githubToken
    ? githubModels.map((model) => ({
        provider: "github-models" as const,
        apiKey: githubToken,
        baseUrl: normalizeBaseUrl(process.env.GITHUB_MODELS_BASE_URL ?? "https://models.inference.ai.azure.com"),
        model,
      }))
    : [];

  const llmConfigs = llmApiKey
    ? llmModels.map((model) => ({
        provider: "llm" as const,
        apiKey: llmApiKey,
        baseUrl: normalizeBaseUrl(overrides?.aiBaseUrl || process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai"),
        model,
      }))
    : [];

  const configs: ProviderConfig[] = [];

  if (preferGithubModels) configs.push(...githubConfigs);
  configs.push(...llmConfigs);
  if (!preferGithubModels) configs.push(...githubConfigs);

  return configs.filter(
    (config, index, list) => list.findIndex(
      (item) => item.provider === config.provider && item.baseUrl === config.baseUrl && item.model === config.model,
    ) === index,
  );
}

export function isAuthenticationError(status: number, message: string) {
  if (status === 401) return true;
  if (status === 403) {
    return /(auth|authentication|api key|token|unauthorized|forbidden|access denied|invalid key|invalid token)/i.test(message);
  }
  return false;
}

export function isModelConfigurationError(status: number, message: string) {
  if (status !== 400 && status !== 403) return false;
  return /(model|does not exist|not found|unsupported|invalid model|available models)/i.test(message);
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
    return `${message} Configure a paid-capable provider via settings or LLM_API_KEY / LLM_BASE_URL / LLM_MODEL, or add GITHUB_TOKEN to enable GitHub Models fallback.`;
  }

  return message;
}

export async function requestChatCompletionsWithFallback(options: {
  payload: Record<string, unknown>;
  preferGithubModels?: boolean;
  settings?: Partial<RuntimeSettings>;
}) {
  const configs = buildProviderConfigs(
    options.preferGithubModels ?? process.env.GITHUB_USE_MODELS === "true",
    sanitizeRuntimeSettingsInput(options.settings),
  );

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
