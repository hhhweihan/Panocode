"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { parseGithubUrl } from "@/lib/github";
import { ArrowRight, Github, History } from "lucide-react";
import {
  subscribeHistorySummaries,
  getHistorySummariesSnapshot,
  getEmptyHistorySummaries,
} from "@/lib/storage";
import type { AnalysisRecordSummary } from "@/lib/storage";

function HistoryCard({
  summary,
  onClick,
}: {
  summary: AnalysisRecordSummary;
  onClick: () => void;
}) {
  const date = new Date(summary.analyzedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const displayUrl = summary.url
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");

  return (
    <button
      onClick={onClick}
      className="text-left w-full rounded-lg border px-3 py-2.5 transition-colors"
      style={{
        borderColor: "var(--border)",
        background: "var(--panel)",
        color: "var(--text)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
          {summary.repoName}
        </span>
        <span className="text-xs shrink-0" style={{ color: "var(--muted)" }}>
          {date}
        </span>
      </div>
      <div className="mt-0.5 text-xs truncate" style={{ color: "var(--muted)" }}>
        {displayUrl}
      </div>
      {summary.topLanguages.length > 0 && (
        <div className="mt-1.5 flex items-center gap-2.5">
          {summary.topLanguages.map((lang) => (
            <span
              key={lang.name}
              className="flex items-center gap-1 text-xs"
              style={{ color: "var(--muted)" }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ background: lang.color }}
              />
              {lang.name}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const history = useSyncExternalStore(
    subscribeHistorySummaries,
    getHistorySummariesSnapshot,
    getEmptyHistorySummaries,
  );

  const handleAnalyze = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a GitHub repository URL");
      return;
    }
    const parsed = parseGithubUrl(trimmed);
    if (!parsed) {
      setError("Invalid GitHub URL. Try: https://github.com/owner/repo");
      return;
    }
    setError("");
    router.push(`/analyze?url=${encodeURIComponent(trimmed)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAnalyze();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (error) setError("");
  };

  const examples = ["vercel/next.js", "facebook/react", "microsoft/vscode"];

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{
        background: "var(--hero-bg)",
      }}
    >
      {/* Grid decoration */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(var(--text) 1px, transparent 1px), linear-gradient(90deg, var(--text) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-2xl w-full">
        {/* Logo */}
        <div
          className="mb-8 flex items-center justify-center w-20 h-20 rounded-2xl border"
          style={{ borderColor: "var(--border)", background: "var(--panel)" }}
        >
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <polyline
              points="13 27 7 20 13 13"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points="27 13 33 20 27 27"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line
              x1="22"
              y1="10"
              x2="18"
              y2="30"
              stroke="var(--accent-hover)"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.6"
            />
          </svg>
        </div>

        {/* Title */}
        <h1
          className="text-6xl font-bold mb-3"
          style={{ letterSpacing: "-0.03em" }}
        >
          <span style={{ color: "var(--text)" }}>Pano</span>
          <span style={{ color: "var(--accent)" }}>code</span>
        </h1>

        <p className="text-lg mb-12" style={{ color: "var(--muted)" }}>
          Explore any GitHub repository — visualize structure, browse files
        </p>

        {/* Input */}
        <div className="w-full">
          <div
            className="flex items-center gap-2 rounded-xl border px-4 py-3 transition-colors"
            style={{
              background: "var(--panel)",
              borderColor: error ? "var(--error)" : "var(--border)",
            }}
          >
            <Github
              size={18}
              style={{ color: "var(--muted)", flexShrink: 0 }}
            />
            <input
              type="text"
              value={url}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="https://github.com/owner/repository"
              className="flex-1 bg-transparent outline-none text-base"
              style={{ color: "var(--text)" }}
              autoFocus
            />
            <button
              onClick={handleAnalyze}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
              style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
            >
              Analyze
              <ArrowRight size={15} />
            </button>
          </div>

          {error && (
            <p className="mt-2 text-sm text-left" style={{ color: "var(--error)" }}>
              {error}
            </p>
          )}
        </div>

        {/* Examples */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Try:
          </span>
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setUrl(`https://github.com/${ex}`);
                setError("");
              }}
              className="text-xs px-3 py-1 rounded-full border transition-colors"
              style={{ color: "var(--muted)", borderColor: "var(--border)" }}
            >
              {ex}
            </button>
          ))}
        </div>

        {/* Recent analyses */}
        {history.length > 0 && (
          <div className="mt-10 w-full">
            <div className="flex items-center gap-2 mb-3">
              <History size={13} style={{ color: "var(--muted)" }} />
              <span
                className="text-xs uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                Recent analyses
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {history.slice(0, 6).map((item) => (
                <HistoryCard
                  key={item.id}
                  summary={item}
                  onClick={() =>
                    router.push(
                      `/analyze?url=${encodeURIComponent(item.url)}&historyId=${item.id}`
                    )
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
