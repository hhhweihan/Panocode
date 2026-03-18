"use client";

import { Loader2, AlertCircle, Sparkles, FileCode } from "lucide-react";
import type { AnalysisResult } from "@/app/api/analyze/route";

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
  onFileClick: (path: string) => void;
}

export default function AnalysisPanel({
  loading,
  error,
  result,
  onFileClick,
}: AnalysisPanelProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 px-3">
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
          <Loader2 size={13} className="animate-spin" style={{ color: "var(--accent)" }} />
          AI 分析中...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-1.5 px-3 py-4">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--error)" }}>
          <AlertCircle size={13} />
          分析失败
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="flex flex-col gap-4 px-3 py-3">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} style={{ color: "var(--accent)" }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          AI 分析
        </span>
      </div>

      {/* Summary */}
      {result.summary && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          {result.summary}
        </p>
      )}

      {/* Languages */}
      {result.languages.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium" style={{ color: "var(--text)" }}>
            语言
          </span>

          {/* Stacked bar */}
          <div className="flex h-2 rounded-full overflow-hidden gap-px">
            {result.languages.map((lang) => (
              <div
                key={lang.name}
                style={{
                  width: `${lang.percentage}%`,
                  background: lang.color || "var(--border)",
                  minWidth: lang.percentage > 0 ? "2px" : "0",
                }}
                title={`${lang.name}: ${lang.percentage}%`}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-1">
            {result.languages.map((lang) => (
              <div key={lang.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: lang.color || "var(--border)" }}
                  />
                  <span className="text-xs" style={{ color: "var(--text)" }}>
                    {lang.name}
                  </span>
                </div>
                <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
                  {lang.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tech Stack */}
      {result.techStack.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium" style={{ color: "var(--text)" }}>
            技术栈
          </span>
          <div className="flex flex-wrap gap-1.5">
            {result.techStack.map((item) => {
              const style = CATEGORY_STYLES[item.category] ?? CATEGORY_STYLES.other;
              return (
                <span
                  key={item.name}
                  className="text-xs px-2 py-0.5 rounded-full border"
                  style={{
                    background: style.bg,
                    color: style.text,
                    borderColor: style.border,
                  }}
                  title={item.category}
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
          <span className="text-xs font-medium" style={{ color: "var(--text)" }}>
            入口文件
          </span>
          <div className="flex flex-col gap-1">
            {result.entryFiles.map((entry) => (
              <button
                key={entry.path}
                onClick={() => onFileClick(entry.path)}
                className="flex items-start gap-1.5 text-left rounded-md px-2 py-1.5 transition-colors"
                style={{ background: "var(--hover)" }}
                title={entry.reason}
              >
                <FileCode size={12} className="shrink-0 mt-0.5" style={{ color: "var(--accent)" }} />
                <div className="min-w-0">
                  <div className="text-xs truncate" style={{ color: "var(--accent)" }}>
                    {entry.path}
                  </div>
                  <div className="text-xs truncate" style={{ color: "var(--muted)" }}>
                    {entry.reason}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
