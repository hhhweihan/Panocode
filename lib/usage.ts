import type { ProviderConfig, ProviderAttempt } from "@/lib/llm";

export interface LlmRequestUsage {
  provider: ProviderConfig["provider"];
  model: string;
  callCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AnalysisUsageStats {
  modelCallCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export const EMPTY_ANALYSIS_USAGE_STATS: AnalysisUsageStats = {
  modelCallCount: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

export function buildLlmRequestUsage(options: {
  config: ProviderConfig;
  attempts: ProviderAttempt[];
  raw: {
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  } | null;
  ok: boolean;
}): LlmRequestUsage {
  const promptTokens = options.raw?.usage?.prompt_tokens ?? 0;
  const completionTokens = options.raw?.usage?.completion_tokens ?? 0;
  const totalTokens = options.raw?.usage?.total_tokens ?? (promptTokens + completionTokens);
  const attemptedCalls = options.ok ? options.attempts.length + 1 : Math.max(options.attempts.length, 1);

  return {
    provider: options.config.provider,
    model: options.config.model,
    callCount: attemptedCalls,
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

export function mergeAnalysisUsageStats(
  current: AnalysisUsageStats,
  next?: LlmRequestUsage | null,
): AnalysisUsageStats {
  if (!next) {
    return current;
  }

  return {
    modelCallCount: current.modelCallCount + next.callCount,
    promptTokens: current.promptTokens + next.promptTokens,
    completionTokens: current.completionTokens + next.completionTokens,
    totalTokens: current.totalTokens + next.totalTokens,
  };
}

export function normalizeAnalysisUsageStats(input?: Partial<AnalysisUsageStats> | null): AnalysisUsageStats {
  return {
    modelCallCount: typeof input?.modelCallCount === "number" ? input.modelCallCount : 0,
    promptTokens: typeof input?.promptTokens === "number" ? input.promptTokens : 0,
    completionTokens: typeof input?.completionTokens === "number" ? input.completionTokens : 0,
    totalTokens: typeof input?.totalTokens === "number" ? input.totalTokens : 0,
  };
}

export function getAverageTokensPerCall(stats: AnalysisUsageStats) {
  if (stats.modelCallCount <= 0) {
    return 0;
  }

  return Math.round(stats.totalTokens / stats.modelCallCount);
}