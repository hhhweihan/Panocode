"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, EyeOff, KeyRound, Save, Settings2, Shield, X } from "lucide-react";
import { useRuntimeSettings } from "@/components/RuntimeSettingsProvider";
import {
  RUNTIME_SETTINGS_OPEN_EVENT,
  type RuntimeSettings,
  type RuntimeSettingsField,
} from "@/lib/runtimeSettings";

const FIELD_TEXT: Array<{
  field: RuntimeSettingsField;
  label: string;
  description: string;
  type: "text" | "password" | "number";
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}> = [
  {
    field: "aiBaseUrl",
    label: "AI Base URL",
    description: "OpenAI 兼容接口地址，例如 DashScope 或 Google AI Studio 的 OpenAI endpoint。",
    type: "text",
    placeholder: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    field: "aiApiKey",
    label: "AI API Key",
    description: "用于仓库分析、入口研判、调用图和模块划分的主模型鉴权。",
    type: "password",
  },
  {
    field: "aiModel",
    label: "AI 模型名称",
    description: "例如 qwen-plus、qwen-coder-turbo-0919、gemini-2.0-flash。",
    type: "text",
    placeholder: "qwen-plus",
  },
  {
    field: "githubToken",
    label: "GitHub Token",
    description: "用于提升 GitHub API 速率限制，并作为 GitHub Models 回退鉴权。",
    type: "password",
  },
  {
    field: "maxDrillDepth",
    label: "最大下钻层数",
    description: "控制自动递归分析和手动继续下钻的最深层级，默认 2。",
    type: "number",
    min: 1,
    max: 8,
    step: 1,
  },
  {
    field: "criticalChildCount",
    label: "关键调用子函数数量",
    description: "控制入口分析和递归扩展每层最多保留多少个关键调用子函数，默认 10。",
    type: "number",
    min: 1,
    max: 20,
    step: 1,
  },
];

function SensitiveToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-[var(--hover)]"
      style={{ borderColor: "var(--border)", color: "var(--muted)" }}
    >
      {visible ? <EyeOff size={13} /> : <Eye size={13} />}
      {visible ? "隐藏" : "显示"}
    </button>
  );
}

export default function SettingsControl() {
  const {
    settings,
    envSources,
    hydrated,
    saveSettings,
    hasEnvOverride,
    isAnalysisReady,
    missingRequiredSettings,
  } = useRuntimeSettings();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RuntimeSettings>(settings);
  const [showSecrets, setShowSecrets] = useState<Record<"aiApiKey" | "githubToken", boolean>>({
    aiApiKey: false,
    githubToken: false,
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    const handleOpen = () => {
      setDraft(settings);
      setOpen(true);
    };

    window.addEventListener(RUNTIME_SETTINGS_OPEN_EVENT, handleOpen);
    return () => {
      window.removeEventListener(RUNTIME_SETTINGS_OPEN_EVENT, handleOpen);
    };
  }, [settings]);

  const overriddenFields = useMemo(
    () => FIELD_TEXT.filter((item) => hasEnvOverride(item.field)),
    [hasEnvOverride],
  );

  const handleSave = () => {
    saveSettings(draft);
    setOpen(false);
  };

  const handleFieldChange = (field: RuntimeSettingsField, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [field]: field === "maxDrillDepth" || field === "criticalChildCount"
        ? Number.parseInt(value || "0", 10) || prev[field]
        : value,
    }));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(settings);
          setOpen(true);
        }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors hover:bg-[var(--hover)]"
        style={{
          borderColor: isAnalysisReady
            ? "color-mix(in srgb, var(--border) 92%, transparent)"
            : "color-mix(in srgb, var(--warning, #f59e0b) 46%, var(--border))",
          background: "color-mix(in srgb, var(--panel) 88%, transparent)",
          color: isAnalysisReady ? "var(--text)" : "var(--warning, #f59e0b)",
          boxShadow: "0 8px 22px color-mix(in srgb, var(--bg) 14%, transparent)",
        }}
        aria-label="打开设置"
        title={isAnalysisReady ? "设置" : "设置（需补充 AI 配置）"}
      >
        <Settings2 size={17} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center px-4 py-6"
          style={{ background: "color-mix(in srgb, var(--bg) 62%, transparent)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border"
            style={{
              borderColor: "var(--border)",
              background: "linear-gradient(180deg, color-mix(in srgb, var(--panel) 94%, transparent), var(--panel))",
              boxShadow: "0 24px 80px color-mix(in srgb, var(--bg) 42%, transparent)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
                  <Settings2 size={16} style={{ color: "var(--accent)" }} />
                  项目设置
                </div>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                  设置会持久化到浏览器本地存储；如果检测到环境变量，启动时会自动覆盖本地值并作为当前生效配置。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-2 transition-colors hover:bg-[var(--hover)]"
                aria-label="关闭设置"
              >
                <X size={16} style={{ color: "var(--muted)" }} />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-5">
              {!isAnalysisReady && (
                <div
                  className="mb-5 rounded-xl border px-4 py-3"
                  style={{
                    borderColor: "color-mix(in srgb, var(--warning, #f59e0b) 42%, var(--border))",
                    background: "color-mix(in srgb, var(--warning, #f59e0b) 10%, var(--panel))",
                  }}
                >
                  <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text)" }}>
                    <AlertTriangle size={15} style={{ color: "var(--warning, #f59e0b)" }} />
                    分析前还需要补充配置
                  </div>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                    当前缺少 {missingRequiredSettings.join(" / ")}。补齐后才能进入分析工作台。
                  </p>
                </div>
              )}

              {overriddenFields.length > 0 && (
                <div
                  className="mb-5 rounded-xl border px-4 py-3"
                  style={{
                    borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border))",
                    background: "color-mix(in srgb, var(--accent) 10%, var(--panel))",
                  }}
                >
                  <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text)" }}>
                    <Shield size={15} style={{ color: "var(--accent)" }} />
                    检测到环境变量覆盖
                  </div>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                    当前共有 {overriddenFields.length} 个设置项由环境变量提供并优先生效，已在启动时同步到本地持久化配置。
                  </p>
                </div>
              )}

              <div className="mb-4 flex items-center gap-2">
                <KeyRound size={14} style={{ color: "var(--accent)" }} />
                <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
                  Runtime Settings
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {FIELD_TEXT.map((item) => {
                  const isSecret = item.field === "aiApiKey" || item.field === "githubToken";
                  const isOverridden = hasEnvOverride(item.field);
                  const envSource = envSources[item.field];
                  const value = draft[item.field];
                  const inputType = isSecret
                    ? (showSecrets[item.field as "aiApiKey" | "githubToken"] ? "text" : "password")
                    : item.type;

                  return (
                    <div
                      key={item.field}
                      className="rounded-xl border p-4"
                      style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium" style={{ color: "var(--text)" }}>
                            {item.label}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                            {item.description}
                          </p>
                        </div>
                        {isOverridden && (
                          <span
                            className="shrink-0 rounded-full border px-2 py-0.5 text-[11px]"
                            style={{
                              borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border))",
                              color: "var(--accent)",
                              background: "color-mix(in srgb, var(--accent) 10%, transparent)",
                            }}
                          >
                            环境变量优先
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type={inputType}
                          value={String(value)}
                          onChange={(event) => handleFieldChange(item.field, event.target.value)}
                          disabled={isOverridden || !hydrated}
                          min={item.min}
                          max={item.max}
                          step={item.step}
                          placeholder={item.placeholder}
                          className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-75"
                          style={{
                            borderColor: isOverridden
                              ? "color-mix(in srgb, var(--accent) 35%, var(--border))"
                              : "var(--border)",
                            background: isOverridden
                              ? "color-mix(in srgb, var(--accent) 7%, var(--panel))"
                              : "var(--panel)",
                            color: "var(--text)",
                          }}
                        />
                        {isSecret && (
                          <SensitiveToggle
                            visible={showSecrets[item.field as "aiApiKey" | "githubToken"]}
                            onToggle={() => {
                              const secretField = item.field as "aiApiKey" | "githubToken";
                              setShowSecrets((prev) => ({ ...prev, [secretField]: !prev[secretField] }));
                            }}
                          />
                        )}
                      </div>

                      <div className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
                        {isOverridden && envSource
                          ? `当前由环境变量 ${envSource} 提供，页面中展示的是启动后实际生效的值。`
                          : "当前由浏览器本地持久化设置控制。"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t px-5 py-4" style={{ borderColor: "var(--border)" }}>
              <button
                type="button"
                onClick={() => {
                  setDraft(settings);
                  setOpen(false);
                }}
                className="rounded-lg border px-4 py-2 text-sm transition-colors hover:bg-[var(--hover)]"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
              >
                <Save size={14} />
                保存设置
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
