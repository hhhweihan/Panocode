"use client";

import { memo } from "react";
import { Loader2, AlertCircle, Sparkles, FileCode, CheckCircle2, XCircle } from "lucide-react";
import type { AnalysisResult } from "@/app/api/analyze/route";
import type { EntryCheckResult } from "@/app/api/analyze/entry/route";
import type { CallgraphBridgeInfo } from "@/lib/callgraphBridge";
import type { RepoInfo } from "@/lib/github";
import type { ModuleAnalysisResult } from "@/lib/moduleAnalysis";

export type AnalysisLocale = "zh" | "en";

export type { EntryCheckResult };

const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  framework: { bg: "#2d1b69", text: "#c4b5fd", border: "#7c3aed" },
  library:   { bg: "#1e3a5f", text: "#93c5fd", border: "#3b82f6" },
  language:  { bg: "#1a2e1a", text: "#86efac", border: "#22c55e" },
  tool:      { bg: "#252525", text: "#d1d5db", border: "#6b7280" },
  database:  { bg: "#3b2100", text: "#fdba74", border: "#f97316" },
  platform:  { bg: "#1a3a2e", text: "#6ee7b7", border: "#10b981" },
  testing:   { bg: "#2d1f3d", text: "#f9a8d4", border: "#ec4899" },
  devops:    { bg: "#1a2e2e", text: "#5eead4", border: "#14b8a6" },
  other:     { bg: "#1a1a2e", text: "#a5b4fc", border: "#6366f1" },
};

interface AnalysisPanelProps {
  loading: boolean;
  error: string | null;
  result: AnalysisResult | null;
  repoInfo?: RepoInfo & { stars?: number } | null;
  moduleAnalysis?: ModuleAnalysisResult | null;
  callgraphBridge?: CallgraphBridgeInfo | null;
  selectedModuleId?: string | null;
  locale: AnalysisLocale;
  onLocaleChange: (locale: AnalysisLocale) => void;
  onFileClick: (path: string) => void;
  onModuleSelect?: (moduleId: string | null) => void;
  entryCheckResults?: Record<string, EntryCheckResult>;
  checkingEntryPath?: string | null;
}

const PANEL_TEXT = {
  zh: {
    loading: "AI 分析中...",
    errorTitle: "分析失败",
    title: "AI 分析",
    repoDetails: "仓库详情",
    description: "简介",
    branch: "分支",
    stars: "Stars",
    forks: "Forks",
    openIssues: "Issues",
    homepage: "主页",
    license: "许可证",
    primaryLanguage: "主语言",
    topics: "主题",
    updatedAt: "更新于",
    modules: "功能模块",
    bridgeMode: "桥接模式",
    bridgeReason: "命中原因",
    bridgeEvidence: "命中证据",
    allModules: "全部模块",
    moduleFile: "工程文件",
    languages: "语言",
    techStack: "技术栈",
    entryFiles: "候选入口文件",
    localeLabel: "语言",
    localeZh: "中文",
    localeEn: "English",
    confirmed: "已确认",
    checking: "研判中",
    notEntry: "非入口",
    category: {
      framework: "框架", library: "库", language: "语言", tool: "工具",
      database: "数据库", platform: "平台", testing: "测试",
      devops: "DevOps", other: "其他",
    },
  },
  en: {
    loading: "Analyzing...",
    errorTitle: "Analysis Failed",
    title: "AI Analysis",
    repoDetails: "Repository Details",
    description: "Description",
    branch: "Branch",
    stars: "Stars",
    forks: "Forks",
    openIssues: "Issues",
    homepage: "Homepage",
    license: "License",
    primaryLanguage: "Primary Language",
    topics: "Topics",
    updatedAt: "Updated",
    modules: "Modules",
    bridgeMode: "Bridge Mode",
    bridgeReason: "Reason",
    bridgeEvidence: "Evidence",
    allModules: "All Modules",
    moduleFile: "Saved File",
    languages: "Languages",
    techStack: "Tech Stack",
    entryFiles: "Candidate Entry Files",
    localeLabel: "Language",
    localeZh: "中文",
    localeEn: "English",
    confirmed: "Confirmed",
    checking: "Checking",
    notEntry: "Not Entry",
    category: {
      framework: "Framework", library: "Library", language: "Language", tool: "Tool",
      database: "Database", platform: "Platform", testing: "Testing",
      devops: "DevOps", other: "Other",
    },
  },
} as const;

function AnalysisPanel({
  loading,
  error,
  result,
  repoInfo,
  moduleAnalysis,
  callgraphBridge,
  selectedModuleId,
  locale,
  onLocaleChange,
  onFileClick,
  onModuleSelect,
  entryCheckResults = {},
  checkingEntryPath,
}: AnalysisPanelProps) {
  const text = PANEL_TEXT[locale];

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 px-3">
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <Loader2 size={13} className="animate-spin" style={{ color: "var(--accent)" }} />
          {text.loading}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-1.5 px-3 py-4">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--error)" }}>
          <AlertCircle size={13} />
          {text.errorTitle}
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!result) return null;

  const updatedAtLabel = repoInfo?.updatedAt
    ? new Date(repoInfo.updatedAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="flex flex-col gap-4 px-3 py-3">
      {/* Header + locale switcher */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Sparkles size={12} style={{ color: "var(--accent)" }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            {text.title}
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-md border px-1 py-1" style={{ borderColor: "var(--border)" }}>
          <span className="px-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            {text.localeLabel}
          </span>
          {(["zh", "en"] as const).map((value) => {
            const active = value === locale;
            return (
              <button
                key={value}
                onClick={() => onLocaleChange(value)}
                className="rounded px-2 py-0.5 text-[11px] transition-colors"
                style={{ background: active ? "var(--accent)" : "transparent", color: active ? "var(--accent-contrast)" : "var(--muted)" }}
              >
                {value === "zh" ? text.localeZh : text.localeEn}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      {result.summary && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          {result.summary}
        </p>
      )}

      {callgraphBridge && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{text.bridgeMode}</span>
          <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="text-xs px-2 py-0.5 rounded-full border"
                style={{
                  color: "var(--accent)",
                  borderColor: "color-mix(in srgb, var(--accent) 40%, var(--border))",
                  background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                }}
              >
                {callgraphBridge.strategyName}
              </span>
              <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                {callgraphBridge.strategyId}
              </span>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>{text.bridgeReason}</span>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text)" }}>
                {callgraphBridge.reason}
              </p>
            </div>
            {callgraphBridge.evidence.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>{text.bridgeEvidence}</span>
                <div className="flex flex-wrap gap-1.5">
                  {callgraphBridge.evidence.map((item) => (
                    <span
                      key={item}
                      className="text-xs px-2 py-0.5 rounded-full border"
                      style={{
                        color: "var(--text)",
                        borderColor: "var(--border)",
                        background: "var(--panel)",
                      }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Repo Details */}
      {repoInfo && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{text.repoDetails}</span>
          <div className="flex flex-col gap-2 rounded-lg border p-2.5" style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}>
            {repoInfo.description && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>{text.description}</span>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text)" }}>{repoInfo.description}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs px-2 py-1 rounded-full border" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>
                {text.branch}: {repoInfo.branch}
              </span>
              {typeof repoInfo.stars === "number" && (
                <span className="text-xs px-2 py-1 rounded-full border" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>
                  {text.stars}: {repoInfo.stars.toLocaleString()}
                </span>
              )}
              {typeof repoInfo.forks === "number" && (
                <span className="text-xs px-2 py-1 rounded-full border" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>
                  {text.forks}: {repoInfo.forks.toLocaleString()}
                </span>
              )}
              {typeof repoInfo.openIssues === "number" && (
                <span className="text-xs px-2 py-1 rounded-full border" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>
                  {text.openIssues}: {repoInfo.openIssues.toLocaleString()}
                </span>
              )}
              {repoInfo.primaryLanguage && (
                <span className="text-xs px-2 py-1 rounded-full border" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>
                  {text.primaryLanguage}: {repoInfo.primaryLanguage}
                </span>
              )}
              {repoInfo.license && (
                <span className="text-xs px-2 py-1 rounded-full border" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>
                  {text.license}: {repoInfo.license}
                </span>
              )}
              {updatedAtLabel && (
                <span className="text-xs px-2 py-1 rounded-full border" style={{ color: "var(--muted)", borderColor: "var(--border)" }}>
                  {text.updatedAt}: {updatedAtLabel}
                </span>
              )}
            </div>

            {repoInfo.homepage && (
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>{text.homepage}</span>
                <a
                  href={repoInfo.homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs truncate"
                  style={{ color: "var(--accent)" }}
                >
                  {repoInfo.homepage}
                </a>
              </div>
            )}

            {repoInfo.topics && repoInfo.topics.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>{text.topics}</span>
                <div className="flex flex-wrap gap-1.5">
                  {repoInfo.topics.map((topic) => (
                    <span
                      key={topic}
                      className="text-xs px-2 py-0.5 rounded-full border"
                      style={{ color: "var(--muted)", borderColor: "var(--border)", background: "var(--panel)" }}
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {moduleAnalysis && moduleAnalysis.modules.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{text.modules}</span>
            {moduleAnalysis.savedFilePath && (
              <span className="text-[11px] truncate" style={{ color: "var(--muted)" }} title={moduleAnalysis.savedFilePath}>
                {text.moduleFile}: {moduleAnalysis.savedFilePath}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => onModuleSelect?.(null)}
              className="text-xs px-2 py-1 rounded-full border transition-colors"
              style={{
                color: selectedModuleId === null ? "var(--text)" : "var(--muted)",
                borderColor: selectedModuleId === null ? "var(--accent)" : "var(--border)",
                background: selectedModuleId === null ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "transparent",
              }}
            >
              {text.allModules}
            </button>
            {moduleAnalysis.modules.map((moduleItem) => {
              const active = selectedModuleId === moduleItem.id;
              return (
                <button
                  key={moduleItem.id}
                  onClick={() => onModuleSelect?.(active ? null : moduleItem.id)}
                  className="text-xs px-2 py-1 rounded-full border transition-colors"
                  title={`${moduleItem.description} (${moduleItem.functions.length})`}
                  style={{
                    color: active ? "#ffffff" : moduleItem.color,
                    borderColor: moduleItem.color,
                    background: active ? moduleItem.color : "transparent",
                  }}
                >
                  {moduleItem.name} ({moduleItem.functions.length})
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-1.5">
            {moduleAnalysis.modules.map((moduleItem) => (
              <div
                key={moduleItem.id}
                className="rounded-md border px-2 py-1.5"
                style={{
                  borderColor: selectedModuleId === moduleItem.id ? moduleItem.color : "var(--border)",
                  background: selectedModuleId === moduleItem.id
                    ? `color-mix(in srgb, ${moduleItem.color} 12%, transparent)`
                    : "var(--panel-2)",
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium" style={{ color: moduleItem.color }}>
                    {moduleItem.name}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                    {moduleItem.functions.length}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                  {moduleItem.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Languages */}
      {result.languages.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{text.languages}</span>
          <div className="flex h-2 rounded-full overflow-hidden gap-px">
            {result.languages.map((lang) => (
              <div
                key={lang.name}
                style={{ width: `${lang.percentage}%`, background: lang.color || "var(--border)", minWidth: lang.percentage > 0 ? "2px" : "0" }}
                title={`${lang.name}: ${lang.percentage}%`}
              />
            ))}
          </div>
          <div className="flex flex-col gap-1">
            {result.languages.map((lang) => (
              <div key={lang.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: lang.color || "var(--border)" }} />
                  <span className="text-xs" style={{ color: "var(--text)" }}>{lang.name}</span>
                </div>
                <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>{lang.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tech Stack */}
      {result.techStack.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{text.techStack}</span>
          <div className="flex flex-wrap gap-1.5">
            {result.techStack.map((item) => {
              const s = CATEGORY_STYLES[item.category] ?? CATEGORY_STYLES.other;
              return (
                <span
                  key={item.name}
                  className="text-xs px-2 py-0.5 rounded-full border"
                  style={{ background: s.bg, color: s.text, borderColor: s.border }}
                  title={text.category[item.category]}
                >
                  {item.name}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Entry Files */}
      {result.entryFiles.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{text.entryFiles}</span>
          <div className="flex flex-col gap-1">
            {result.entryFiles.map((entry) => {
              const check = entryCheckResults[entry.path];
              const isChecking = checkingEntryPath === entry.path;
              const isConfirmed = check?.isEntry === true;
              const isRejected = check?.isEntry === false;

              return (
                <button
                  key={entry.path}
                  onClick={() => onFileClick(entry.path)}
                  className="flex items-start gap-1.5 text-left rounded-md px-2 py-1.5 transition-colors"
                  style={{
                    background: isConfirmed ? "#1a3a1a" : isRejected ? "transparent" : "var(--hover)",
                    opacity: isRejected ? 0.5 : 1,
                    border: isConfirmed ? "1px solid #22c55e33" : "1px solid transparent",
                  }}
                  title={check?.reason ?? entry.reason}
                >
                  {/* Status icon */}
                  <div className="shrink-0 mt-0.5">
                    {isChecking && <Loader2 size={12} className="animate-spin" style={{ color: "var(--accent)" }} />}
                    {isConfirmed && <CheckCircle2 size={12} style={{ color: "var(--success)" }} />}
                    {isRejected && <XCircle size={12} style={{ color: "var(--muted)" }} />}
                    {!isChecking && !isConfirmed && !isRejected && (
                      <FileCode size={12} style={{ color: "var(--accent)" }} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="text-xs truncate flex-1"
                        style={{ color: isConfirmed ? "var(--success)" : isRejected ? "var(--muted)" : "var(--accent)" }}
                      >
                        {entry.path}
                      </span>
                      {isConfirmed && (
                        <span
                          className="text-[10px] px-1.5 py-0 rounded-full shrink-0"
                          style={{ background: "#14532d", color: "var(--success)", border: "1px solid #22c55e44" }}
                        >
                          {text.confirmed}
                        </span>
                      )}
                      {isChecking && (
                        <span className="text-[10px] shrink-0" style={{ color: "var(--muted)" }}>
                          {text.checking}...
                        </span>
                      )}
                    </div>
                    <div className="text-xs truncate" style={{ color: "var(--muted)" }}>
                      {check?.reason ?? entry.reason}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(AnalysisPanel);
