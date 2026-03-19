"use client";

import { memo, useEffect, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { getLanguageFromPath } from "@/lib/github";
import { Copy, Check } from "lucide-react";
import type { AnalysisLocale } from "@/components/AnalysisPanel";
import { useTheme } from "@/lib/theme";

interface CodePanelProps {
  path: string | null;
  content: string | null;
  loading: boolean;
  error: string | null;
  locale: AnalysisLocale;
}

const CODE_FONT_SIZE_STORAGE_KEY = "panocode-code-font-size";
const CODE_FONT_SIZE_MIN = 11;
const CODE_FONT_SIZE_MAX = 24;
const CODE_FONT_SIZE_STEP = 1;

function clampFontSize(size: number) {
  return Math.min(Math.max(size, CODE_FONT_SIZE_MIN), CODE_FONT_SIZE_MAX);
}

const TEXT = {
  zh: {
    empty: "选择一个文件查看内容",
    copy: "复制",
    copied: "已复制",
    loading: "加载中",
    zoomOut: "缩小字体",
    zoomIn: "放大字体",
    resetZoom: "重置字号",
    fontSizeLabel: "字号",
  },
  en: {
    empty: "Select a file to view its contents",
    copy: "Copy",
    copied: "Copied",
    loading: "Loading",
    zoomOut: "Decrease font size",
    zoomIn: "Increase font size",
    resetZoom: "Reset font size",
    fontSizeLabel: "Font",
  },
} as const;

function CodePanel({ path, content, loading, error, locale }: CodePanelProps) {
  const [copied, setCopied] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window === "undefined") {
      return 13;
    }

    try {
      const savedFontSize = window.localStorage.getItem(CODE_FONT_SIZE_STORAGE_KEY);
      if (!savedFontSize) return 13;

      const parsed = Number(savedFontSize);
      return Number.isNaN(parsed) ? 13 : clampFontSize(parsed);
    } catch {
      return 13;
    }
  });
  const theme = useTheme();
  const text = TEXT[locale];

  useEffect(() => {
    try {
      window.localStorage.setItem(CODE_FONT_SIZE_STORAGE_KEY, String(fontSize));
    } catch {
      // Ignore localStorage write failures.
    }
  }, [fontSize]);

  const updateFontSize = (delta: number) => {
    setFontSize((current) => clampFontSize(current + delta));
  };

  const resetFontSize = () => {
    setFontSize(13);
  };

  const handleCopy = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!path) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-[var(--muted)]">
        <div className="w-16 h-16 rounded-2xl bg-[var(--panel-2)] flex items-center justify-center border border-[var(--border)]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </div>
        <p className="text-sm">{text.empty}</p>
      </div>
    );
  }

  const filename = path.split("/").pop() || path;
  const language = getLanguageFromPath(path);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--panel-2)] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[var(--muted)] text-xs truncate">{path}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <div
            className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--hover)] px-1 py-1"
          >
            <span className="px-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
              {text.fontSizeLabel}
            </span>
            <button
              type="button"
              onClick={() => updateFontSize(-CODE_FONT_SIZE_STEP)}
              disabled={fontSize <= CODE_FONT_SIZE_MIN}
              aria-label={text.zoomOut}
              className="h-6 w-6 rounded text-sm text-[var(--muted)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              A-
            </button>
            <button
              type="button"
              onClick={resetFontSize}
              aria-label={text.resetZoom}
              className="min-w-11 rounded px-1.5 py-0.5 text-[11px] text-[var(--muted)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text)]"
            >
              {fontSize}px
            </button>
            <button
              type="button"
              onClick={() => updateFontSize(CODE_FONT_SIZE_STEP)}
              disabled={fontSize >= CODE_FONT_SIZE_MAX}
              aria-label={text.zoomIn}
              className="h-6 w-6 rounded text-sm text-[var(--muted)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              A+
            </button>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--hover)] text-[var(--muted)] border border-[var(--border)]">
            {language}
          </span>
          {content && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              {copied ? <Check size={13} className="text-[var(--success)]" /> : <Copy size={13} />}
              {copied ? text.copied : text.copy}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="h-full flex items-center justify-center text-[var(--muted)] text-sm gap-2">
            <div className="w-4 h-4 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
            {text.loading} {filename}...
          </div>
        )}
        {error && !loading && (
          <div className="h-full flex items-center justify-center text-[var(--error)] text-sm">
            {error}
          </div>
        )}
        {content && !loading && (
          <SyntaxHighlighter
            language={language}
            style={theme === "light" ? oneLight : oneDark}
            showLineNumbers
            customStyle={{
              margin: 0,
              padding: "1rem",
              background: "var(--code-bg)",
              fontSize: `${fontSize}px`,
              lineHeight: "1.6",
              minHeight: "100%",
            }}
            lineNumberStyle={{
              color: "var(--code-line-number)",
              fontSize: `${fontSize}px`,
              userSelect: "none",
              minWidth: "3em",
            }}
          >
            {content}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  );
}

export default memo(CodePanel);
