"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseGithubUrl, type RepoInfo, type TreeNode } from "@/lib/github";
import { filterCodeFiles } from "@/lib/codeFilter";
import { makeLogEntry, type LogEntry } from "@/lib/logger";
import FileTree from "@/components/FileTree";
import CodePanel from "@/components/CodePanel";
import AnalysisPanel from "@/components/AnalysisPanel";
import type { AnalysisLocale, EntryCheckResult } from "@/components/AnalysisPanel";
import LogPanel from "@/components/LogPanel";
import PanoramaPanel from "@/components/PanoramaPanel";
import type { AnalysisResult } from "@/app/api/analyze/route";
import type { CallgraphResult, CallgraphNode } from "@/app/api/analyze/callgraph/route";
import { extractFunctionSnippet, addChildrenToNode } from "@/lib/callgraphUtils";
import {
  Github,
  ArrowRight,
  Star,
  GitBranch,
  ChevronLeft,
  AlertCircle,
  Loader2,
} from "lucide-react";

const LEFT_PANEL_MIN_WIDTH = 260;
const LEFT_PANEL_MAX_WIDTH = 520;
const TREE_PANEL_MIN_WIDTH = 220;
const TREE_PANEL_MAX_WIDTH = 520;
const PANORAMA_PANEL_MIN_WIDTH = 300;
const PANORAMA_PANEL_MAX_WIDTH = 900;

function clampWidth(width: number, min: number, max: number) {
  return Math.min(Math.max(width, min), max);
}

const UI_TEXT = {
  zh: {
    invalidUrl: "GitHub URL 格式无效",
    emptyUrl: "请输入 GitHub 仓库地址",
    analyzeTitle: "开始分析",
    repoLoadFailed: "仓库加载失败",
    networkRetry: "网络错误，请重试",
    fileLoadFailed: "文件加载失败",
    fileContentLoadFailed: "文件内容加载失败",
    files: "文件",
    loadingTree: "加载文件树中...",
    emptyRepo: "输入仓库地址以开始探索",
  },
  en: {
    invalidUrl: "Invalid GitHub URL format",
    emptyUrl: "Please enter a GitHub repository URL",
    analyzeTitle: "Analyze",
    repoLoadFailed: "Failed to load repository",
    networkRetry: "Network error, please try again",
    fileLoadFailed: "Failed to load file",
    fileContentLoadFailed: "Failed to load file content",
    files: "Files",
    loadingTree: "Loading tree...",
    emptyRepo: "Enter a repository URL to explore",
  },
} as const;

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
  const [analysisLocale, setAnalysisLocale] = useState<AnalysisLocale>("zh");
  const [analysisCache, setAnalysisCache] = useState<Partial<Record<AnalysisLocale, AnalysisResult>>>({});

  const [entryCheckResults, setEntryCheckResults] = useState<Record<string, EntryCheckResult>>({});
  const [checkingEntryPath, setCheckingEntryPath] = useState<string | null>(null);

  const [callgraphLoading, setCallgraphLoading] = useState(false);
  const [callgraphResult, setCallgraphResult] = useState<CallgraphResult | null>(null);
  const [analyzingFunctions, setAnalyzingFunctions] = useState<Set<string>>(new Set());

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logPanelMode, setLogPanelMode] = useState<"docked" | "floating">("docked");
  const [leftPanelWidth, setLeftPanelWidth] = useState(288);
  const [treePanelWidth, setTreePanelWidth] = useState(288);
  const [panoramaPanelWidth, setPanoramaPanelWidth] = useState(400);
  const analysisLocaleRef = useRef<AnalysisLocale>("zh");
  const resizePanelRef = useRef<"left" | "tree" | "panorama" | null>(null);
  const text = UI_TEXT[analysisLocale];

  useEffect(() => {
    const savedMode = window.localStorage.getItem("panocode-log-panel-mode");
    if (savedMode === "docked" || savedMode === "floating") {
      setLogPanelMode(savedMode);
    }

    const savedLeftWidth = window.localStorage.getItem("panocode-left-panel-width");
    const savedTreeWidth = window.localStorage.getItem("panocode-tree-panel-width");
    const savedPanoramaWidth = window.localStorage.getItem("panocode-panorama-panel-width");

    if (savedLeftWidth) {
      setLeftPanelWidth(clampWidth(Number(savedLeftWidth), LEFT_PANEL_MIN_WIDTH, LEFT_PANEL_MAX_WIDTH));
    }
    if (savedTreeWidth) {
      setTreePanelWidth(clampWidth(Number(savedTreeWidth), TREE_PANEL_MIN_WIDTH, TREE_PANEL_MAX_WIDTH));
    }
    if (savedPanoramaWidth) {
      setPanoramaPanelWidth(clampWidth(Number(savedPanoramaWidth), PANORAMA_PANEL_MIN_WIDTH, PANORAMA_PANEL_MAX_WIDTH));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("panocode-log-panel-mode", logPanelMode);
  }, [logPanelMode]);

  useEffect(() => {
    window.localStorage.setItem("panocode-left-panel-width", String(leftPanelWidth));
  }, [leftPanelWidth]);

  useEffect(() => {
    window.localStorage.setItem("panocode-tree-panel-width", String(treePanelWidth));
  }, [treePanelWidth]);

  useEffect(() => {
    window.localStorage.setItem("panocode-panorama-panel-width", String(panoramaPanelWidth));
  }, [panoramaPanelWidth]);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      if (resizePanelRef.current === "left") {
        setLeftPanelWidth(clampWidth(event.clientX, LEFT_PANEL_MIN_WIDTH, LEFT_PANEL_MAX_WIDTH));
      }

      if (resizePanelRef.current === "tree") {
        setTreePanelWidth(
          clampWidth(event.clientX - leftPanelWidth - 4, TREE_PANEL_MIN_WIDTH, TREE_PANEL_MAX_WIDTH)
        );
      }

      if (resizePanelRef.current === "panorama") {
        setPanoramaPanelWidth(
          clampWidth(window.innerWidth - event.clientX, PANORAMA_PANEL_MIN_WIDTH, PANORAMA_PANEL_MAX_WIDTH)
        );
      }
    };

    const handlePointerUp = () => {
      resizePanelRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, [leftPanelWidth]);

  const startResize = (panel: "left" | "tree" | "panorama") => {
    resizePanelRef.current = panel;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [...prev, entry]);
  }, []);

  useEffect(() => {
    analysisLocaleRef.current = analysisLocale;
  }, [analysisLocale]);

  const runRecursiveAnalysis = useCallback(async (
    initialResult: CallgraphResult,
    info: RepoInfo & { stars?: number },
    entryFileContent: string,
  ) => {
    const maxDepth = parseInt(process.env.NEXT_PUBLIC_CALLGRAPH_MAX_DEPTH ?? "2", 10);
    if (maxDepth < 2) return; // depth-1 is already done by the initial callgraph

    const allFilePaths = filterCodeFiles(info.tree);
    const contentCache = new Map<string, string>();
    contentCache.set(initialResult.entryFile, entryFileContent);

    async function fetchContent(filePath: string): Promise<string | null> {
      if (contentCache.has(filePath)) return contentCache.get(filePath)!;
      const node = findNodeByPath(info.tree, filePath);
      if (!node || node.type !== "blob") return null;
      try {
        const params = new URLSearchParams({
          owner: info.owner, repo: info.repo, path: node.path, sha: node.sha,
        });
        const res = await fetch(`/api/github/file?${params}`);
        if (!res.ok) return null;
        const data = await res.json() as { content: string };
        contentCache.set(filePath, data.content);
        return data.content;
      } catch { return null; }
    }

    type QueueItem = {
      node: CallgraphNode;
      depth: number;
      parentFile: string;
      pathIndices: number[];
    };

    const queue: QueueItem[] = initialResult.children
      .filter((n) => n.drillDown >= 0)
      .map((node, i) => ({
        node,
        depth: 1,
        parentFile: initialResult.entryFile,
        pathIndices: [i],
      }));

    const visited = new Set<string>([initialResult.rootFunction]);
    let localResult = initialResult;

    while (queue.length > 0) {
      const item = queue.shift()!;
      const { node, depth, parentFile, pathIndices } = item;

      if (depth >= maxDepth) continue;
      if (visited.has(node.name)) continue;
      if (node.drillDown === -1) continue;
      visited.add(node.name);

      setAnalyzingFunctions((prev) => new Set([...prev, node.name]));

      // Phase 1: search in parent file
      let snippet: string | null = null;
      let foundFile = parentFile;

      const parentContent = await fetchContent(parentFile);
      if (parentContent) snippet = extractFunctionSnippet(parentContent, node.name);

      // Phase 2: fetch likelyFile if Phase 1 failed
      if (!snippet && node.likelyFile) {
        const likelyContent = await fetchContent(node.likelyFile);
        if (likelyContent) {
          snippet = extractFunctionSnippet(likelyContent, node.name);
          if (snippet) foundFile = node.likelyFile;
        }
      }

      // Phase 3: ask AI to suggest files
      if (!snippet) {
        try {
          const locRes = await fetch("/api/analyze/callgraph/locate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              repoName: info.fullName,
              functionName: node.name,
              callerFile: parentFile,
              allFilePaths,
            }),
          });
          if (locRes.ok) {
            const locData = await locRes.json() as { suggestedFiles: string[] };
            for (const suggestedFile of locData.suggestedFiles) {
              const content = await fetchContent(suggestedFile);
              if (content) {
                snippet = extractFunctionSnippet(content, node.name);
                if (snippet) { foundFile = suggestedFile; break; }
              }
            }
          }
        } catch { /* ignore locate errors */ }
      }

      setAnalyzingFunctions((prev) => { const s = new Set(prev); s.delete(node.name); return s; });

      if (!snippet) continue;

      // Expand: get sub-functions of this node
      try {
        const expandRes = await fetch("/api/analyze/callgraph/expand", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoName: info.fullName,
            functionName: node.name,
            filePath: foundFile,
            functionSnippet: snippet,
            allFilePaths,
          }),
        });
        if (expandRes.ok) {
          const expandData = await expandRes.json() as { children: CallgraphNode[] };
          if (expandData.children.length > 0) {
            localResult = addChildrenToNode(localResult, pathIndices, expandData.children);
            setCallgraphResult(localResult);
            addLog(makeLogEntry("info",
              `递归分析：${node.name} → ${expandData.children.length} 个子函数`));

            expandData.children
              .filter((c) => c.drillDown >= 0 && !visited.has(c.name))
              .forEach((child, i) => {
                queue.push({
                  node: child,
                  depth: depth + 1,
                  parentFile: foundFile,
                  pathIndices: [...pathIndices, i],
                });
              });
          }
        }
      } catch { /* ignore expand errors */ }
    }
  }, [addLog]);

  const runCallgraphAnalysis = useCallback(async (
    confirmedPath: string,
    fileContent: string,
    info: RepoInfo & { stars?: number },
  ) => {
    setCallgraphLoading(true);
    setCallgraphResult(null);
    setAnalyzingFunctions(new Set());

    const allFilePaths = filterCodeFiles(info.tree);
    addLog(makeLogEntry("info", `调用图分析：开始分析 ${confirmedPath} 的关键子函数…`));

    try {
      const res = await fetch("/api/analyze/callgraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoName: info.fullName,
          filePath: confirmedPath,
          fileContent,
          allFilePaths,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? "调用图分析失败";
        addLog(makeLogEntry("warning", `调用图分析失败：${msg}`));
        return;
      }

      const result = data as CallgraphResult;
      setCallgraphResult(result);
      addLog(makeLogEntry(
        "success",
        `调用图分析完成：${result.rootFunction} 识别到 ${result.children.length} 个关键子函数`,
      ));

      // Kick off recursive analysis
      runRecursiveAnalysis(result, info, fileContent);
    } catch {
      addLog(makeLogEntry("warning", "调用图分析：网络请求失败"));
    } finally {
      setCallgraphLoading(false);
    }
  }, [addLog, runRecursiveAnalysis]);

  const runEntryAnalysis = useCallback(async (
    entryFiles: AnalysisResult["entryFiles"],
    info: RepoInfo & { stars?: number },
    languages: AnalysisResult["languages"],
  ) => {
    setEntryCheckResults({});

    for (const entry of entryFiles) {
      setCheckingEntryPath(entry.path);

      const node = findNodeByPath(info.tree, entry.path);
      if (!node || node.type !== "blob") {
        addLog(makeLogEntry("warning", `入口研判：找不到文件节点 ${entry.path}`));
        continue;
      }

      let fileContent: string;
      try {
        const params = new URLSearchParams({
          owner: info.owner,
          repo: info.repo,
          path: node.path,
          sha: node.sha,
        });
        const res = await fetch(`/api/github/file?${params}`);
        const data = await res.json();
        if (!res.ok) {
          addLog(makeLogEntry("warning", `入口研判：${entry.path} 文件读取失败`));
          continue;
        }
        fileContent = (data as { content: string }).content;
      } catch {
        addLog(makeLogEntry("warning", `入口研判：${entry.path} 网络错误`));
        continue;
      }

      const lines = fileContent.split("\n");
      const truncated =
        lines.length > 4000
          ? [
              ...lines.slice(0, 2000),
              `\n// ... (${lines.length - 4000} lines omitted) ...\n`,
              ...lines.slice(-2000),
            ].join("\n")
          : fileContent;

      addLog(makeLogEntry("info", `入口研判：开始分析 ${entry.path}（${lines.length} 行）`));

      try {
        const res = await fetch("/api/analyze/entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repoUrl: `https://github.com/${info.fullName}`,
            repoName: info.fullName,
            description: info.description ?? null,
            languages: languages.map((l) => ({ name: l.name, percentage: l.percentage })),
            filePath: entry.path,
            fileContent: truncated,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          const msg = (data as { error?: string }).error ?? "研判失败";
          addLog(makeLogEntry("warning", `入口研判：${entry.path} — ${msg}`));
          continue;
        }

        const result = data as EntryCheckResult;
        setEntryCheckResults((prev) => ({ ...prev, [entry.path]: result }));
        addLog(makeLogEntry(
          result.isEntry ? "success" : "info",
          `入口研判：${entry.path} — ${result.isEntry ? "✓ 确认为入口" : "✗ 非入口"} (${result.confidence}) — ${result.reason}`,
        ));

        if (result.isEntry) {
          // Kick off callgraph analysis with the confirmed entry file content
          runCallgraphAnalysis(entry.path, truncated, info);
          break;
        }
      } catch {
        addLog(makeLogEntry("warning", `入口研判：${entry.path} 请求失败`));
      }
    }

    setCheckingEntryPath(null);
  }, [addLog, runCallgraphAnalysis]);

  const fetchAnalysis = useCallback(async (info: RepoInfo, locale: AnalysisLocale) => {
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
          locale,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const msg = (data as { error?: string }).error || "分析失败";
        setAnalysisError(msg);
        addLog(makeLogEntry("error", `AI 分析失败：${msg}`));
        return;
      }

      const result = data as AnalysisResult;
      setAnalysisCache((prev) => ({ ...prev, [locale]: result }));
      if (analysisLocaleRef.current === locale) {
        setAnalysisResult(result);
      }
      addLog(makeLogEntry(
        "success",
        `AI 分析完成（${locale === "zh" ? "中文" : "English"}）`,
        { response: data }
      ));

      if (result.entryFiles.length > 0) {
        runEntryAnalysis(result.entryFiles, info as RepoInfo & { stars?: number }, result.languages);
      }
    } catch {
      const msg = "网络错误，AI 分析请求失败";
      setAnalysisError(msg);
      addLog(makeLogEntry("error", msg));
    } finally {
      setAnalysisLoading(false);
    }
  }, [addLog, runEntryAnalysis]);

  const fetchTree = useCallback(async (url: string) => {
    const parsed = parseGithubUrl(url);
    if (!parsed) {
      setInputError(text.invalidUrl);
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
    setAnalysisCache({});
    setEntryCheckResults({});
    setCheckingEntryPath(null);
    setCallgraphResult(null);
    setCallgraphLoading(false);
    setAnalyzingFunctions(new Set());
    setLogs([makeLogEntry("success", `GitHub URL 校验通过：${parsed.owner}/${parsed.repo}`)]);

    try {
      const res = await fetch(`/api/github/tree?url=${encodeURIComponent(url)}`);
      const data = await res.json();

      if (!res.ok) {
        const msg = (data as { error?: string }).error || text.repoLoadFailed;
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

      fetchAnalysis(info, analysisLocaleRef.current);
    } catch {
      const msg = text.networkRetry;
      setTreeError(msg);
      addLog(makeLogEntry("error", msg));
    } finally {
      setTreeLoading(false);
    }
  }, [addLog, fetchAnalysis, text.invalidUrl, text.networkRetry, text.repoLoadFailed]);

  useEffect(() => {
    const url = searchParams.get("url");
    if (url) {
      setInputUrl(url);
      fetchTree(url);
    }
  }, [fetchTree, searchParams]);

  const handleAnalyze = () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setInputError(text.emptyUrl);
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
        setFileError((data as { error?: string }).error || text.fileLoadFailed);
        return;
      }
      setFileContent((data as { content: string }).content);
    } catch {
      setFileError(text.fileContentLoadFailed);
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

  const handleAnalysisLocaleChange = (locale: AnalysisLocale) => {
    setAnalysisLocale(locale);

    if (analysisCache[locale]) {
      setAnalysisResult(analysisCache[locale] ?? null);
      setAnalysisError(null);
      setAnalysisLoading(false);
      return;
    }

    if (repoInfo) {
      fetchAnalysis(repoInfo, locale);
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
          className="shrink-0 flex flex-col border-r overflow-hidden"
          style={{ width: `${leftPanelWidth}px`, borderColor: "var(--border)", background: "var(--panel)" }}
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
                title={text.analyzeTitle}
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
          <LogPanel
            entries={logs}
            locale={analysisLocale}
            mode={logPanelMode}
            onModeChange={setLogPanelMode}
          />

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
                locale={analysisLocale}
                onLocaleChange={handleAnalysisLocaleChange}
                onFileClick={handleEntryFileClick}
                entryCheckResults={entryCheckResults}
                checkingEntryPath={checkingEntryPath}
              />
            )}
          </div>
        </aside>

        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={() => startResize("left")}
          className="group relative w-1 shrink-0 cursor-col-resize bg-transparent"
        >
          <div className="absolute inset-y-0 left-0 w-px bg-[var(--border)] transition-colors group-hover:bg-[var(--accent)]" />
        </div>

        {/* Middle panel — file tree */}
        <div
          className="shrink-0 flex flex-col border-r overflow-hidden"
          style={{ width: `${treePanelWidth}px`, borderColor: "var(--border)", background: "var(--panel)" }}
        >
          <div
            className="px-3 py-2 border-b text-xs font-medium uppercase tracking-wider shrink-0"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            {text.files}
          </div>

          <div className="flex-1 overflow-auto">
            {treeLoading && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm" style={{ color: "var(--muted)" }}>
                <Loader2 size={16} className="animate-spin" />
                {text.loadingTree}
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
                <p className="text-xs">{text.emptyRepo}</p>
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

        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={() => startResize("tree")}
          className="group relative w-1 shrink-0 cursor-col-resize bg-transparent"
        >
          <div className="absolute inset-y-0 left-0 w-px bg-[var(--border)] transition-colors group-hover:bg-[var(--accent)]" />
        </div>

        {/* Right panel — code viewer */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#0d1117", minWidth: 280 }}>
          <CodePanel
            path={selectedPath}
            content={fileContent}
            loading={fileLoading}
            error={fileError}
            locale={analysisLocale}
          />
        </div>

        {/* Panorama panel resize separator */}
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={() => startResize("panorama")}
          className="group relative w-1 shrink-0 cursor-col-resize bg-transparent"
        >
          <div className="absolute inset-y-0 left-0 w-px bg-[var(--border)] transition-colors group-hover:bg-[var(--accent)]" />
        </div>

        {/* Panorama panel — call graph tree */}
        <div
          className="shrink-0 flex flex-col overflow-hidden"
          style={{ width: `${panoramaPanelWidth}px`, borderLeft: "1px solid var(--border)" }}
        >
          <PanoramaPanel
            loading={callgraphLoading}
            result={callgraphResult}
            locale={analysisLocale}
            onFileClick={handleEntryFileClick}
            analyzingFunctions={analyzingFunctions}
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
