export type RuntimeSettings = {
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  githubToken: string;
  maxDrillDepth: number;
  criticalChildCount: number;
};

export type RuntimeSettingsField = keyof RuntimeSettings;

export type RuntimeSettingsEnvSources = Partial<Record<RuntimeSettingsField, string>>;

export const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  aiBaseUrl: "",
  aiApiKey: "",
  aiModel: "",
  githubToken: "",
  maxDrillDepth: 2,
  criticalChildCount: 10,
};

export const RUNTIME_SETTINGS_STORAGE_KEY = "panocode-runtime-settings";
export const RUNTIME_SETTINGS_EVENT = "panocode-runtime-settings-updated";
export const RUNTIME_SETTINGS_HEADER = "x-panocode-runtime-settings";

const MAX_DRILL_DEPTH_LIMIT = { min: 1, max: 8 } as const;
const CRITICAL_CHILD_COUNT_LIMIT = { min: 1, max: 20 } as const;

function clampInteger(value: unknown, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

export function sanitizeRuntimeSettingsInput(input: unknown): Partial<RuntimeSettings> {
  if (!input || typeof input !== "object") {
    return {};
  }

  const value = input as Record<string, unknown>;
  const next: Partial<RuntimeSettings> = {};

  const aiBaseUrl = normalizeString(value.aiBaseUrl);
  const aiApiKey = normalizeString(value.aiApiKey);
  const aiModel = normalizeString(value.aiModel);
  const githubToken = normalizeString(value.githubToken);
  const maxDrillDepth = clampInteger(value.maxDrillDepth, MAX_DRILL_DEPTH_LIMIT.min, MAX_DRILL_DEPTH_LIMIT.max);
  const criticalChildCount = clampInteger(
    value.criticalChildCount,
    CRITICAL_CHILD_COUNT_LIMIT.min,
    CRITICAL_CHILD_COUNT_LIMIT.max,
  );

  if (typeof aiBaseUrl !== "undefined") next.aiBaseUrl = aiBaseUrl;
  if (typeof aiApiKey !== "undefined") next.aiApiKey = aiApiKey;
  if (typeof aiModel !== "undefined") next.aiModel = aiModel;
  if (typeof githubToken !== "undefined") next.githubToken = githubToken;
  if (typeof maxDrillDepth !== "undefined") next.maxDrillDepth = maxDrillDepth;
  if (typeof criticalChildCount !== "undefined") next.criticalChildCount = criticalChildCount;

  return next;
}

export function finalizeRuntimeSettings(input?: Partial<RuntimeSettings>): RuntimeSettings {
  return {
    aiBaseUrl: input?.aiBaseUrl ?? DEFAULT_RUNTIME_SETTINGS.aiBaseUrl,
    aiApiKey: input?.aiApiKey ?? DEFAULT_RUNTIME_SETTINGS.aiApiKey,
    aiModel: input?.aiModel ?? DEFAULT_RUNTIME_SETTINGS.aiModel,
    githubToken: input?.githubToken ?? DEFAULT_RUNTIME_SETTINGS.githubToken,
    maxDrillDepth: input?.maxDrillDepth ?? DEFAULT_RUNTIME_SETTINGS.maxDrillDepth,
    criticalChildCount: input?.criticalChildCount ?? DEFAULT_RUNTIME_SETTINGS.criticalChildCount,
  };
}

function readFirstEnvValue(names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) {
      return { value: value.trim(), source: name };
    }
  }

  return null;
}

export function getEnvRuntimeSettingsSnapshot() {
  const envSettings: Partial<RuntimeSettings> = {};
  const envSources: RuntimeSettingsEnvSources = {};

  const aiBaseUrl = readFirstEnvValue(["LLM_BASE_URL"]);
  const aiApiKey = readFirstEnvValue(["LLM_API_KEY", "GEMINI_API_KEY"]);
  const aiModel = readFirstEnvValue(["LLM_MODEL"]);
  const githubToken = readFirstEnvValue(["GITHUB_TOKEN"]);
  const maxDrillDepth = readFirstEnvValue(["NEXT_PUBLIC_CALLGRAPH_MAX_DEPTH", "CALLGRAPH_MAX_DEPTH"]);
  const criticalChildCount = readFirstEnvValue([
    "NEXT_PUBLIC_CALLGRAPH_KEY_CHILDREN_LIMIT",
    "CALLGRAPH_KEY_CHILDREN_LIMIT",
    "PANOCODE_CRITICAL_CHILD_COUNT",
  ]);

  if (aiBaseUrl) {
    envSettings.aiBaseUrl = aiBaseUrl.value;
    envSources.aiBaseUrl = aiBaseUrl.source;
  }

  if (aiApiKey) {
    envSettings.aiApiKey = aiApiKey.value;
    envSources.aiApiKey = aiApiKey.source;
  }

  if (aiModel) {
    envSettings.aiModel = aiModel.value;
    envSources.aiModel = aiModel.source;
  }

  if (githubToken) {
    envSettings.githubToken = githubToken.value;
    envSources.githubToken = githubToken.source;
  }

  if (maxDrillDepth) {
    const parsed = clampInteger(maxDrillDepth.value, MAX_DRILL_DEPTH_LIMIT.min, MAX_DRILL_DEPTH_LIMIT.max);
    if (typeof parsed !== "undefined") {
      envSettings.maxDrillDepth = parsed;
      envSources.maxDrillDepth = maxDrillDepth.source;
    }
  }

  if (criticalChildCount) {
    const parsed = clampInteger(
      criticalChildCount.value,
      CRITICAL_CHILD_COUNT_LIMIT.min,
      CRITICAL_CHILD_COUNT_LIMIT.max,
    );
    if (typeof parsed !== "undefined") {
      envSettings.criticalChildCount = parsed;
      envSources.criticalChildCount = criticalChildCount.source;
    }
  }

  return { envSettings, envSources };
}

export function parseRuntimeSettingsHeader(headerValue: string | null): Partial<RuntimeSettings> {
  if (!headerValue) {
    return {};
  }

  try {
    return sanitizeRuntimeSettingsInput(JSON.parse(decodeURIComponent(headerValue)));
  } catch {
    return {};
  }
}

export function resolveRuntimeSettings(options?: {
  bodySettings?: unknown;
  headerSettings?: string | null;
}) {
  const headerSettings = parseRuntimeSettingsHeader(options?.headerSettings ?? null);
  const bodySettings = sanitizeRuntimeSettingsInput(options?.bodySettings);
  const { envSettings, envSources } = getEnvRuntimeSettingsSnapshot();

  return {
    settings: finalizeRuntimeSettings({
      ...headerSettings,
      ...bodySettings,
      ...envSettings,
    }),
    envSettings,
    envSources,
  };
}

export function encodeRuntimeSettingsHeader(settings: RuntimeSettings) {
  return encodeURIComponent(JSON.stringify(finalizeRuntimeSettings(sanitizeRuntimeSettingsInput(settings))));
}

export function buildRuntimeSettingsHeaders(settings: RuntimeSettings) {
  return {
    [RUNTIME_SETTINGS_HEADER]: encodeRuntimeSettingsHeader(settings),
  };
}
