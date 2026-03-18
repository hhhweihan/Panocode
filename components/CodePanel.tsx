"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { getLanguageFromPath } from "@/lib/github";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface CodePanelProps {
  path: string | null;
  content: string | null;
  loading: boolean;
  error: string | null;
}

export default function CodePanel({ path, content, loading, error }: CodePanelProps) {
  const [copied, setCopied] = useState(false);

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
        <p className="text-sm">Select a file to view its contents</p>
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
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--hover)] text-[var(--muted)] border border-[var(--border)]">
            {language}
          </span>
          {content && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            >
              {copied ? <Check size={13} className="text-[var(--success)]" /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="h-full flex items-center justify-center text-[var(--muted)] text-sm gap-2">
            <div className="w-4 h-4 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
            Loading {filename}...
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
            style={oneDark}
            showLineNumbers
            customStyle={{
              margin: 0,
              padding: "1rem",
              background: "#0d1117",
              fontSize: "13px",
              lineHeight: "1.6",
              minHeight: "100%",
            }}
            lineNumberStyle={{
              color: "#3d444d",
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
