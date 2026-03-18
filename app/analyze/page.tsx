"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseGithubUrl, type RepoInfo, type TreeNode } from "@/lib/github";
import FileTree from "@/components/FileTree";
import CodePanel from "@/components/CodePanel";
import {
  Github,
  ArrowRight,
  Star,
  GitBranch,
  ChevronLeft,
  AlertCircle,
  Loader2,
} from "lucide-react";

function AnalyzeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [inputUrl, setInputUrl] = useState("");
  const [inputError, setInputError] = useState("");

  const [repoInfo, setRepoInfo] = useState<RepoInfo & { stars?: number } | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Load repo from URL param on mount
  useEffect(() => {
    const url = searchParams.get("url");
    if (url) {
      setInputUrl(url);
      fetchTree(url);
    }
  }, []);

  const fetchTree = async (url: string) => {
    const parsed = parseGithubUrl(url);
    if (!parsed) {
      setInputError("Invalid GitHub URL format");
      return;
    }
    setInputError("");
    setTreeLoading(true);
    setTreeError(null);
    setRepoInfo(null);
    setSelectedPath(null);
    setFileContent(null);

    try {
      const res = await fetch(`/api/github/tree?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok) {
        setTreeError(data.error || "Failed to load repository");
        return;
      }
      setRepoInfo(data);
    } catch {
      setTreeError("Network error — please try again");
    } finally {
      setTreeLoading(false);
    }
  };

  const handleAnalyze = () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setInputError("Please enter a GitHub repository URL");
      return;
    }
    router.replace(`/analyze?url=${encodeURIComponent(trimmed)}`);
    fetchTree(trimmed);
  };

  const handleFileClick = async (path: string) => {
    if (!repoInfo) return;
    setSelectedPath(path);
    setFileContent(null);
    setFileError(null);
    setFileLoading(true);

    try {
      const params = new URLSearchParams({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        path,
        branch: repoInfo.branch,
      });
      const res = await fetch(`/api/github/file?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setFileError(data.error || "Failed to load file");
        return;
      }
      setFileContent(data.content);
    } catch {
      setFileError("Failed to load file content");
    } finally {
      setFileLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Top bar */}
      <header
        className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--panel)" }}
      >
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: "var(--muted)" }}
        >
          <ChevronLeft size={16} />
          <span className="font-semibold" style={{ color: "var(--accent)" }}>
            Panocode
          </span>
        </button>
        {repoInfo && (
          <>
            <span style={{ color: "var(--border)" }}>/</span>
            <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
              {repoInfo.fullName}
            </span>
            {repoInfo.stars !== undefined && (
              <span
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border"
                style={{ color: "var(--muted)", borderColor: "var(--border)" }}
              >
                <Star size={11} />
                {repoInfo.stars.toLocaleString()}
              </span>
            )}
            <span
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border"
              style={{ color: "var(--muted)", borderColor: "var(--border)" }}
            >
              <GitBranch size={11} />
              {repoInfo.branch}
            </span>
          </>
        )}
      </header>

      {/* Main 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel — input + reserved space */}
        <aside
          className="w-72 shrink-0 flex flex-col border-r overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--panel)" }}
        >
          {/* Repo input section */}
          <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
            <div
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm"
              style={{
                background: "var(--panel-2)",
                borderColor: inputError ? "var(--error)" : "var(--border)",
              }}
            >
              <Github size={14} style={{ color: "var(--muted)", flexShrink: 0 }} />
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => {
                  setInputUrl(e.target.value);
                  if (inputError) setInputError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                placeholder="github.com/owner/repo"
                className="flex-1 bg-transparent outline-none min-w-0"
                style={{ color: "var(--text)", fontSize: "12px" }}
              />
              <button
                onClick={handleAnalyze}
                className="shrink-0 p-0.5 rounded transition-colors"
                style={{ color: "var(--accent)" }}
                title="Analyze"
              >
                <ArrowRight size={14} />
              </button>
            </div>
            {inputError && (
              <p className="mt-1.5 text-xs flex items-center gap-1" style={{ color: "var(--error)" }}>
                <AlertCircle size={11} />
                {inputError}
              </p>
            )}
          </div>

          {/* Repo description */}
          {repoInfo?.description && (
            <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--muted)", lineHeight: "1.5" }}>
                {repoInfo.description}
              </p>
            </div>
          )}

          {/* Reserved space for future features */}
          <div className="flex-1 overflow-auto">
            {/* Intentionally left for future additions */}
          </div>
        </aside>

        {/* Middle panel — file tree */}
        <div
          className="w-72 shrink-0 flex flex-col border-r overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--panel)" }}
        >
          <div
            className="px-3 py-2 border-b text-xs font-medium uppercase tracking-wider shrink-0"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            Files
          </div>

          <div className="flex-1 overflow-auto">
            {treeLoading && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm" style={{ color: "var(--muted)" }}>
                <Loader2 size={16} className="animate-spin" />
                Loading tree...
              </div>
            )}
            {treeError && !treeLoading && (
              <div className="flex flex-col items-center gap-2 py-12 px-4 text-center">
                <AlertCircle size={20} style={{ color: "var(--error)" }} />
                <p className="text-sm" style={{ color: "var(--error)" }}>
                  {treeError}
                </p>
              </div>
            )}
            {!treeLoading && !treeError && !repoInfo && (
              <div className="flex flex-col items-center gap-2 py-12 px-4 text-center" style={{ color: "var(--muted)" }}>
                <Github size={24} />
                <p className="text-xs">Enter a repository URL to explore</p>
              </div>
            )}
            {repoInfo && !treeLoading && (
              <FileTree
                tree={repoInfo.tree}
                selectedPath={selectedPath}
                onFileClick={handleFileClick}
              />
            )}
          </div>
        </div>

        {/* Right panel — code viewer */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#0d1117" }}>
          <CodePanel
            path={selectedPath}
            content={fileContent}
            loading={fileLoading}
            error={fileError}
          />
        </div>
      </div>
    </div>
  );
}

export default function AnalyzePage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center" style={{ background: "var(--bg)", color: "var(--muted)" }}>
        <Loader2 size={24} className="animate-spin" />
      </div>
    }>
      <AnalyzeContent />
    </Suspense>
  );
}
