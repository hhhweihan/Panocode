"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseGithubUrl, type RepoInfo, type TreeNode } from "@/lib/github";
import { filterCodeFiles } from "@/lib/codeFilter";
import { makeLogEntry, type LogEntry } from "@/lib/logger";
import FileTree from "@/components/FileTree";
import CodePanel from "@/components/CodePanel";
import AnalysisPanel from "@/components/AnalysisPanel";
import LogPanel from "@/components/LogPanel";
import type { AnalysisResult } from "@/app/api/analyze/route";
import {
  Github,
  ArrowRight,
  Star,
  GitBranch,
  ChevronLeft,
  AlertCircle,
  Loader2,
} from "lucide-react";

function findNodeByPath(tree: TreeNode[], targetPath: string): TreeNode | null {
  for (const node of tree) {
    if (node.path === targetPath) return node;
    if (node.children) {
      const found = findNodeByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

/** Count all blob nodes in a tree */
function countFiles(tree: TreeNode[]): { files: number; dirs: number } {
  let files = 0;
  let dirs = 0;
  function walk(nodes: TreeNode[]) {
    for (const n of nodes) {
      if (n.type === "tree") {
        dirs++;
        if (n.children) walk(n.children);
      } else {
        files++;
      }
    }
  }
  walk(tree);
  return { files, dirs };
}

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

  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (entry: LogEntry) =>
    setLogs((prev) => [...prev, entry]);

  useEffect(() => {
    const url = searchParams.get("url");
    if (url) {
      setInputUrl(url);
      fetchTree(url);
    }
  }, []);

  const fetchAnalysis = async (info: RepoInfo) => {
    const allPaths = filterCodeFiles(info.tree);

    addLog(makeLogEntry(
      "info",
      `代码文件过滤：共 ${allPaths.length} 个代码文件（已排除图片、lock 文件等）`
    ));

    if (allPaths.length === 0) return;

    const requestPayload = {
      repoName: info.fullName,
      fileCount: allPaths.length,
      filePaths: allPaths,
    };

    addLog(makeLogEntry(
      "info",
      "发起 AI 分析请求…",
      { request: requestPayload }
    ));

    setAnalysisLoading(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoName: info.fullName,
          filePaths: allPaths,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const msg = (data as { error?: string }).error || "分析失败";
        setAnalysisError(msg);
        addLog(makeLogEntry("error", `AI 分析失败：${msg}`));
        return;
      }

      setAnalysisResult(data as AnalysisResult);
      addLog(makeLogEntry(
        "success",
        "AI 分析完成",
        { response: data }
      ));
    } catch {
      const msg = "网络错误，AI 分析请求失败";
      setAnalysisError(msg);
      addLog(makeLogEntry("error", msg));
    } finally {
      setAnalysisLoading(false);
    }
  };

  const fetchTree = async (url: string) => {
    const parsed = parseGithubUrl(url);
    if (!parsed) {
      setInputError("Invalid GitHub URL format");
      addLog(makeLogEntry("error", `GitHub URL 校验失败：无效的地址格式 "${url}"`));
      return;
    }

    addLog(makeLogEntry(
      "success",
      `GitHub URL 校验通过：${parsed.owner}/${parsed.repo}`
    ));

    setInputError("");
    setTreeLoading(true);
    setTreeError(null);
    setRepoInfo(null);
    setSelectedPath(null);
    setFileContent(null);
    setAnalysisResult(null);
    setAnalysisError(null);
    setLogs([makeLogEntry("success", `GitHub URL 校验通过：${parsed.owner}/${parsed.repo}`)]);

    try {
      const res = await fetch(`/api/github/tree?url=${encodeURIComponent(url)}`);
      const data = await res.json();

      if (!res.ok) {
        const msg = (data as { error?: string }).error || "Failed to load repository";
        setTreeError(msg);
        addLog(makeLogEntry("error", `仓库获取失败：${msg}`));
        return;
      }

      const info = data as RepoInfo & { stars?: number };
      setRepoInfo(info);

      const { files, dirs } = countFiles(info.tree);
      addLog(makeLogEntry(
        "success",
        `文件树加载完成：${files} 个文件，${dirs} 个目录`
      ));

      fetchAnalysis(info);
    } catch {
      const msg = "网络错误，请重试";
      setTreeError(msg);
      addLog(makeLogEntry("error", msg));
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

  const handleFileClick = async (node: TreeNode) => {
    if (!repoInfo) return;
    setSelectedPath(node.path);
    setFileContent(null);
    setFileError(null);
    setFileLoading(true);

    try {
      const params = new URLSearchParams({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        path: node.path,
        sha: node.sha,
      });
      const res = await fetch(`/api/github/file?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setFileError((data as { error?: string }).error || "Failed to load file");
        return;
      }
      setFileContent((data as { content: string }).content);
    } catch {
      setFileError("Failed to load file content");
    } finally {
      setFileLoading(false);
    }
  };

  const handleEntryFileClick = (path: string) => {
    if (!repoInfo) return;
    const node = findNodeByPath(repoInfo.tree, path);
    if (node && node.type === "blob") {
      handleFileClick(node);
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
        {/* Left panel */}
        <aside
          className="w-72 shrink-0 flex flex-col border-r overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--panel)" }}
        >
          {/* Repo input */}
          <div className="p-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
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

          {/* Work log panel */}
          <LogPanel entries={logs} />

          {/* Scrollable bottom: description + AI analysis */}
          <div className="flex-1 overflow-auto flex flex-col">
            {repoInfo?.description && (
              <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs" style={{ color: "var(--muted)", lineHeight: "1.5" }}>
                  {repoInfo.description}
                </p>
              </div>
            )}

            {(analysisLoading || analysisError || analysisResult) && (
              <AnalysisPanel
                loading={analysisLoading}
                error={analysisError}
                result={analysisResult}
                onFileClick={handleEntryFileClick}
              />
            )}
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
                <p className="text-sm" style={{ color: "var(--error)" }}>{treeError}</p>
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
    <Suspense
      fallback={
        <div
          className="h-screen flex items-center justify-center"
          style={{ background: "var(--bg)", color: "var(--muted)" }}
        >
          <Loader2 size={24} className="animate-spin" />
        </div>
      }
    >
      <AnalyzeContent />
    </Suspense>
  );
}
