"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { parseGithubUrl } from "@/lib/github";
import { ArrowRight, FolderOpen, Github, History } from "lucide-react";
import {
  subscribeHistorySummaries,
  getHistorySummariesSnapshot,
  getEmptyHistorySummaries,
} from "@/lib/storage";
import type { AnalysisRecordSummary } from "@/lib/storage";
import * as localFileStore from "@/lib/localFileStore";

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

  const isLocal = (summary.source ?? "github") === "local";
  const displayUrl = isLocal
    ? summary.url
    : summary.url.replace(/^https?:\/\//, "").replace(/\/+$/, "");

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
        <div className="flex items-center gap-1.5 min-w-0">
          {isLocal && (
            <FolderOpen size={13} style={{ color: "var(--muted)", flexShrink: 0 }} />
          )}
          <span className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
            {summary.repoName}
          </span>
        </div>
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

  const [activeTab, setActiveTab] = useState<"github" | "local">("github");
  const [localPath, setLocalPath] = useState("");
  const [localError, setLocalError] = useState("");
  const [localPickerMode, setLocalPickerMode] = useState<"server" | "client">("server");
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

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

  const handleLocalAnalyze = () => {
    if (!localPath.trim() && localPickerMode === "server") {
      setLocalError("请输入本地项目路径");
      return;
    }
    setLocalError("");
    if (localPickerMode === "client") {
      const name = localPath || "local-project";
      router.push(`/analyze?source=local&mode=client&name=${encodeURIComponent(name)}`);
    } else {
      router.push(`/analyze?source=local&path=${encodeURIComponent(localPath.trim())}`);
    }
  };

  const handlePickerClick = async () => {
    type WinWithPicker = Window & { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> };
    if (typeof window === "undefined" || typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker !== "function") {
      return;
    }
    try {
      const handle = await (window as unknown as WinWithPicker).showDirectoryPicker();
      localFileStore.setHandle(handle);
      setLocalPath(handle.name);
      setLocalPickerMode("client");
      setLocalError("");
    } catch {
      // User cancelled — no-op
    }
  };

  const handleLocalPathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalPath(e.target.value);
    setLocalPickerMode("server");
    localFileStore.clearHandle();
    if (localError) setLocalError("");
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

        {/* Tab bar */}
        <div className="flex gap-0 mb-6 border-b w-full" style={{ borderColor: "var(--border)" }}>
          {(["github", "local"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2 text-sm font-medium transition-colors"
              style={{
                color: activeTab === tab ? "var(--accent)" : "var(--muted)",
                borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: "-1px",
                background: "transparent",
              }}
            >
              {tab === "github" ? "GitHub 分析" : "本地项目"}
            </button>
          ))}
        </div>

        {/* GitHub tab */}
        {activeTab === "github" && (
          <div className="w-full">
            {/* Input */}
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
          </div>
        )}

        {/* Local tab */}
        {activeTab === "local" && (
          <div className="w-full">
            {mounted && typeof window !== "undefined" &&
              typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function" && (
              <button
                onClick={handlePickerClick}
                className="mb-3 flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--panel)",
                  color: "var(--text)",
                }}
              >
                <FolderOpen size={16} />
                选择文件夹
              </button>
            )}

            <div
              className="flex items-center gap-2 rounded-xl border px-4 py-3 transition-colors"
              style={{
                background: "var(--panel)",
                borderColor: localError ? "var(--error, #ef4444)" : "var(--border)",
              }}
            >
              <FolderOpen size={18} style={{ color: "var(--muted)", flexShrink: 0 }} />
              <input
                type="text"
                value={localPath}
                onChange={handleLocalPathChange}
                onKeyDown={(e) => { if (e.key === "Enter") handleLocalAnalyze(); }}
                placeholder="C:\Users\me\my-project  或  /home/me/my-project"
                className="flex-1 bg-transparent outline-none text-base"
                style={{ color: "var(--text)" }}
              />
              <button
                onClick={handleLocalAnalyze}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
                style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
              >
                Analyze
                <ArrowRight size={15} />
              </button>
            </div>

            {localError && (
              <p className="mt-2 text-sm text-left" style={{ color: "var(--error, #ef4444)" }}>
                {localError}
              </p>
            )}

            {localPickerMode === "client" && localPath && (
              <p className="mt-2 text-xs text-left" style={{ color: "var(--muted)" }}>
                已选择文件夹：{localPath}（将在浏览器中直接读取）
              </p>
            )}
          </div>
        )}

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
                  onClick={() => {
                    const isLocal = (item.source ?? "github") === "local";
                    if (isLocal) {
                      router.push(`/analyze?source=local&path=${encodeURIComponent(item.url)}`);
                    } else {
                      router.push(
                        `/analyze?url=${encodeURIComponent(item.url)}&historyId=${item.id}`
                      );
                    }
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
