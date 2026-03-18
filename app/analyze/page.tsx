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
import {
  addChildrenToNode,
  extractFunctionSnippet,
  getNodeAtPath,
  serializeCallgraphPath,
} from "@/lib/callgraphUtils";
import { saveRecord, getRecordById } from "@/lib/storage";
import type { AnalysisRecord } from "@/lib/storage";
import { buildMarkdown, downloadMarkdown } from "@/lib/markdownExport";
import { flattenCallgraphFunctions, type ModuleAnalysisResult } from "@/lib/moduleAnalysis";
import {
  Github,
  ArrowRight,
  Star,
  GitBranch,
  ChevronLeft,
  AlertCircle,
  Loader2,
  RefreshCcw,
  Download,
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

const WORKFLOW_LABELS = {
  zh: {
    idle: "待开始",
    tree: "加载仓库中",
    analysis: "仓库 AI 分析中",
    entry: "入口研判中",
    callgraph: "调用图分析中",
    recursive: "递归扩展中",
    modules: "模块划分中",
    complete: "工作流结束",
    error: "流程异常",
  },
  en: {
    idle: "Idle",
    tree: "Loading Repo",
    analysis: "Analyzing Repo",
    entry: "Checking Entry",
    callgraph: "Building Callgraph",
    recursive: "Expanding Graph",
    modules: "Analyzing Modules",
    complete: "Workflow Complete",
    error: "Workflow Error",
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
  const [callgraphDescriptionLocale, setCallgraphDescriptionLocale] = useState<AnalysisLocale>("zh");
  const [analyzingFunctions, setAnalyzingFunctions] = useState<Set<string>>(new Set());
  const [manualDrilldownPaths, setManualDrilldownPaths] = useState<Set<string>>(new Set());
  const [moduleAnalysis, setModuleAnalysis] = useState<ModuleAnalysisResult | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState<{
    state: "idle" | "working" | "completed" | "error";
    stage: keyof typeof WORKFLOW_LABELS.zh;
  }>({ state: "idle", stage: "idle" });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logPanelMode, setLogPanelMode] = useState<"docked" | "floating">("docked");
  const [leftPanelWidth, setLeftPanelWidth] = useState(288);
  const [treePanelWidth, setTreePanelWidth] = useState(288);
  const [panoramaPanelWidth, setPanoramaPanelWidth] = useState(400);
  const analysisLocaleRef = useRef<AnalysisLocale>("zh");
  const resizePanelRef = useRef<"left" | "tree" | "panorama" | null>(null);

  const [isRestoredFromHistory, setIsRestoredFromHistory] = useState(false);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);

  // Stale-closure-safe refs for save trigger
  const analysisResultRef = useRef<typeof analysisResult>(null);
  const entryCheckResultsRef = useRef<Record<string, import("@/app/api/analyze/entry/route").EntryCheckResult>>({});
  const callgraphResultRef = useRef<typeof callgraphResult>(null);
  const moduleAnalysisRef = useRef<ModuleAnalysisResult | null>(null);
  const logsRef = useRef<typeof logs>([]);
  const analyzeUrlRef = useRef<string>("");
  const drilldownCacheRef = useRef<Map<string, CallgraphNode[]>>(new Map());
  const callgraphCacheRef = useRef<Partial<Record<AnalysisLocale, CallgraphResult>>>({});
  const callgraphDescriptionLocaleRef = useRef<AnalysisLocale>("zh");
  const confirmedEntryContextRef = useRef<{
    path: string;
    fileContent: string;
    info: RepoInfo & { stars?: number };
  } | null>(null);
  const runModuleAnalysisRef = useRef<((
    graphResult: CallgraphResult,
    info: RepoInfo & { stars?: number },
  ) => Promise<ModuleAnalysisResult | null>) | null>(null);
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

  useEffect(() => {
    callgraphDescriptionLocaleRef.current = callgraphDescriptionLocale;
  }, [callgraphDescriptionLocale]);

  useEffect(() => { analysisResultRef.current = analysisResult; }, [analysisResult]);
  useEffect(() => { entryCheckResultsRef.current = entryCheckResults; }, [entryCheckResults]);
  useEffect(() => { callgraphResultRef.current = callgraphResult; }, [callgraphResult]);
  useEffect(() => { moduleAnalysisRef.current = moduleAnalysis; }, [moduleAnalysis]);
  useEffect(() => { logsRef.current = logs; }, [logs]);

  const triggerSave = useCallback((
    info: import("@/lib/github").RepoInfo & { stars?: number },
  ) => {
    if (isRestoredFromHistory) return;
    const result = analysisResultRef.current;
    if (!result) return;

    const record: AnalysisRecord = {
      id: String(Date.now()),
      analyzedAt: new Date().toISOString(),
      url: analyzeUrlRef.current,
      repoMeta: {
        owner: info.owner,
        repo: info.repo,
        branch: info.branch,
        fullName: info.fullName,
        description: info.description,
        homepage: info.homepage,
        primaryLanguage: info.primaryLanguage,
        license: info.license,
        topics: info.topics,
        stars: info.stars,
        forks: info.forks,
        openIssues: info.openIssues,
        updatedAt: info.updatedAt,
      },
      fileTree: info.tree,
      analysisResult: result,
      entryCheckResults: entryCheckResultsRef.current,
      callgraphResult: callgraphResultRef.current,
      moduleAnalysis: moduleAnalysisRef.current,
      logs: logsRef.current,
    };
    saveRecord(record);
    setCurrentRecordId(record.id);
  }, [isRestoredFromHistory]);

  const fetchRepoFileContent = useCallback(async (
    info: RepoInfo & { stars?: number },
    filePath: string,
  ): Promise<string | null> => {
    const node = findNodeByPath(info.tree, filePath);
    if (!node || node.type !== "blob") {
      return null;
    }

    try {
      const params = new URLSearchParams({
        owner: info.owner,
        repo: info.repo,
        path: node.path,
        sha: node.sha,
      });
      const res = await fetch(`/api/github/file?${params}`);
      const data = await res.json() as { content?: string };
      if (!res.ok || !data.content) {
        return null;
      }
      return data.content;
    } catch {
      return null;
    }
  }, []);

  const persistCallgraphArtifact = useCallback(async (
    graphResult: CallgraphResult,
    info: RepoInfo & { stars?: number },
  ): Promise<string | null> => {
    try {
      const currentAnalysis = analysisResultRef.current;
      const res = await fetch("/api/analyze/callgraph/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoName: info.fullName,
          repoUrl: `https://github.com/${info.fullName}`,
          summary: currentAnalysis?.summary ?? null,
          description: info.description ?? currentAnalysis?.summary ?? null,
          locale: callgraphDescriptionLocaleRef.current,
          callgraphResult: graphResult,
        }),
      });
      const data = await res.json() as { error?: string; savedFilePath?: string };

      if (!res.ok) {
        addLog(makeLogEntry("warning", `调用图工程文件保存失败：${data.error ?? "unknown error"}`));
        return null;
      }

      return data.savedFilePath ?? null;
    } catch {
      addLog(makeLogEntry("warning", "调用图工程文件保存失败：网络请求异常"));
      return null;
    }
  }, [addLog]);

  const runRecursiveAnalysis = useCallback(async (
    initialResult: CallgraphResult,
    info: RepoInfo & { stars?: number },
    entryFileContent: string,
    descriptionLocale: AnalysisLocale,
  ) => {
    const maxDepth = parseInt(process.env.NEXT_PUBLIC_CALLGRAPH_MAX_DEPTH ?? "2", 10);
    if (maxDepth < 2) return initialResult; // depth-1 is already done by the initial callgraph

    const allFilePaths = filterCodeFiles(info.tree);
    const contentCache = new Map<string, string>();
    contentCache.set(initialResult.entryFile, entryFileContent);

    const getFunctionCacheKey = (functionName: string, filePath: string) =>
      `${filePath}::${functionName}`.toLowerCase();

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
      .filter((n) => n.drillDown === 1)
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
      if (node.drillDown !== 1) continue;

      const wasVisited = visited.has(node.name);
      if (!wasVisited) {
        visited.add(node.name);
      }

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
          const locateRequest = {
            repoName: info.fullName,
            functionName: node.name,
            callerFile: parentFile,
            allFilePaths,
          };
          addLog(makeLogEntry("info", `函数定位：开始定位 ${node.name}`, { request: locateRequest }));
          const locRes = await fetch("/api/analyze/callgraph/locate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(locateRequest),
          });
          if (locRes.ok) {
            const locData = await locRes.json() as { suggestedFiles: string[] };
            addLog(makeLogEntry("info", `函数定位：${node.name} 已返回候选文件`, { response: locData }));
            for (const suggestedFile of locData.suggestedFiles) {
              const content = await fetchContent(suggestedFile);
              if (content) {
                snippet = extractFunctionSnippet(content, node.name);
                if (snippet) { foundFile = suggestedFile; break; }
              }
            }
          } else {
            const locError = await locRes.json() as { error?: string };
            addLog(makeLogEntry("warning", `函数定位失败：${node.name} — ${locError.error ?? "unknown error"}`, { response: locError }));
          }
        } catch { /* ignore locate errors */ }
      }

      if (!snippet) {
        setAnalyzingFunctions((prev) => { const s = new Set(prev); s.delete(node.name); return s; });
        continue;
      }

      const cacheKey = getFunctionCacheKey(node.name, foundFile);
      const cachedChildren = drilldownCacheRef.current.get(cacheKey);
      addLog(makeLogEntry("info", `递归分析缓存：${node.name} — ${cachedChildren ? "命中" : "未命中"}`));

      if (cachedChildren) {
        if (cachedChildren.length > 0) {
          localResult = addChildrenToNode(localResult, pathIndices, cachedChildren);
          setCallgraphResult(localResult);
          cachedChildren
            .filter((c) => c.drillDown === 1 && !visited.has(c.name))
            .forEach((child, index) => {
              queue.push({
                node: child,
                depth: depth + 1,
                parentFile: child.likelyFile ?? foundFile,
                pathIndices: [...pathIndices, index],
              });
            });
        }
        setAnalyzingFunctions((prev) => { const s = new Set(prev); s.delete(node.name); return s; });
        continue;
      }

      if (wasVisited) {
        setAnalyzingFunctions((prev) => { const s = new Set(prev); s.delete(node.name); return s; });
        continue;
      }

      // Expand: get sub-functions of this node
      try {
        const expandRequest = {
          repoName: info.fullName,
          functionName: node.name,
          filePath: foundFile,
          functionSnippet: snippet,
          allFilePaths,
          locale: descriptionLocale,
        };
        addLog(makeLogEntry("info", `递归分析：开始分析 ${node.name} 的关键子函数`, { request: expandRequest }));
        const expandRes = await fetch("/api/analyze/callgraph/expand", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(expandRequest),
        });
        if (expandRes.ok) {
          const expandData = await expandRes.json() as { children: CallgraphNode[] };
          drilldownCacheRef.current.set(cacheKey, expandData.children);
          addLog(makeLogEntry("success", `递归分析：${node.name} AI 返回 ${expandData.children.length} 个关键子函数`, { response: expandData }));
          if (expandData.children.length > 0) {
            localResult = addChildrenToNode(localResult, pathIndices, expandData.children);
            setCallgraphResult(localResult);
            addLog(makeLogEntry("info",
              `递归分析：${node.name} → ${expandData.children.length} 个子函数`));

            expandData.children
              .filter((c) => c.drillDown === 1 && !visited.has(c.name))
              .forEach((child, i) => {
                queue.push({
                  node: child,
                  depth: depth + 1,
                  parentFile: foundFile,
                  pathIndices: [...pathIndices, i],
                });
              });
          }
        } else {
          const expandError = await expandRes.json() as { error?: string };
          addLog(makeLogEntry("warning", `递归分析失败：${node.name} — ${expandError.error ?? "unknown error"}`, { response: expandError }));
        }
      } catch { /* ignore expand errors */ }
      setAnalyzingFunctions((prev) => { const s = new Set(prev); s.delete(node.name); return s; });
    }
    return localResult;
  }, [addLog]);

  const handleManualDrilldown = useCallback(async (path: number[]) => {
    const info = repoInfo;
    const graph = callgraphResultRef.current;
    if (!info || !graph) {
      return;
    }

    const targetNode = getNodeAtPath(graph, path);
    if (!targetNode || targetNode.drillDown === -1 || (targetNode.children?.length ?? 0) > 0) {
      return;
    }

    const pathKey = serializeCallgraphPath(path);
    setManualDrilldownPaths((prev) => new Set(prev).add(pathKey));
    setAnalyzingFunctions((prev) => new Set(prev).add(targetNode.name));
    addLog(makeLogEntry("info", `手动下钻：开始分析 ${targetNode.name} 的下一层子节点…`));

    try {
      const allFilePaths = filterCodeFiles(info.tree);
      const parentNode = path.length > 1 ? getNodeAtPath(graph, path.slice(0, -1)) : null;
      const candidateFiles = [
        parentNode?.likelyFile ?? graph.entryFile,
        targetNode.likelyFile,
      ].filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);

      let functionSnippet: string | null = null;
      let foundFile = candidateFiles[0] ?? graph.entryFile;

      for (const candidateFile of candidateFiles) {
        const content = await fetchRepoFileContent(info, candidateFile);
        if (!content) {
          continue;
        }

        const snippet = extractFunctionSnippet(content, targetNode.name);
        if (snippet) {
          functionSnippet = snippet;
          foundFile = candidateFile;
          break;
        }
      }

      if (!functionSnippet) {
        const locateRequest = {
          repoName: info.fullName,
          functionName: targetNode.name,
          callerFile: parentNode?.likelyFile ?? graph.entryFile,
          allFilePaths,
        };
        addLog(makeLogEntry("info", `手动下钻：定位 ${targetNode.name} 的源码文件`, { request: locateRequest }));

        const locateRes = await fetch("/api/analyze/callgraph/locate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(locateRequest),
        });
        const locateData = await locateRes.json() as { error?: string; suggestedFiles?: string[] };

        if (locateRes.ok && locateData.suggestedFiles) {
          for (const suggestedFile of locateData.suggestedFiles) {
            const content = await fetchRepoFileContent(info, suggestedFile);
            if (!content) {
              continue;
            }

            const snippet = extractFunctionSnippet(content, targetNode.name);
            if (snippet) {
              functionSnippet = snippet;
              foundFile = suggestedFile;
              break;
            }
          }
        } else {
          addLog(makeLogEntry("warning", `手动下钻定位失败：${locateData.error ?? targetNode.name}`));
        }
      }

      if (!functionSnippet) {
        addLog(makeLogEntry("warning", `手动下钻失败：无法定位 ${targetNode.name} 的函数实现`));
        return;
      }

      const cacheKey = `${foundFile}::${targetNode.name}`.toLowerCase();
      let nextChildren = drilldownCacheRef.current.get(cacheKey) ?? null;

      if (!nextChildren) {
        const expandRequest = {
          repoName: info.fullName,
          functionName: targetNode.name,
          filePath: foundFile,
          functionSnippet,
          allFilePaths,
          locale: callgraphDescriptionLocaleRef.current,
        };
        addLog(makeLogEntry("info", `手动下钻：请求 ${targetNode.name} 的一层子节点`, { request: expandRequest }));

        const expandRes = await fetch("/api/analyze/callgraph/expand", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(expandRequest),
        });
        const expandData = await expandRes.json() as { error?: string; children?: CallgraphNode[] };

        if (!expandRes.ok) {
          addLog(makeLogEntry("warning", `手动下钻失败：${expandData.error ?? "expand failed"}`));
          return;
        }

        nextChildren = expandData.children ?? [];
        drilldownCacheRef.current.set(cacheKey, nextChildren);
      }

      const updatedResult = addChildrenToNode(graph, path, nextChildren ?? []);
      setCallgraphResult(updatedResult);
      callgraphResultRef.current = updatedResult;
      callgraphCacheRef.current[callgraphDescriptionLocaleRef.current] = updatedResult;

      const savedFilePath = await persistCallgraphArtifact(updatedResult, info);
      addLog(makeLogEntry(
        "success",
        `手动下钻完成：${targetNode.name} 新增 ${(nextChildren ?? []).length} 个子节点${savedFilePath ? `，已保存到 ${savedFilePath}` : ""}`,
      ));

      if (!isRestoredFromHistory) {
        triggerSave(info);
      }

      if (runModuleAnalysisRef.current) {
        setModuleAnalysis(null);
        moduleAnalysisRef.current = null;
        setSelectedModuleId(null);
        addLog(makeLogEntry("info", "手动下钻后重新生成功能模块划分…"));
        const refreshedModuleAnalysis = await runModuleAnalysisRef.current(updatedResult, info);
        if (refreshedModuleAnalysis && !isRestoredFromHistory) {
          triggerSave(info);
        }
      }
    } finally {
      setManualDrilldownPaths((prev) => {
        const next = new Set(prev);
        next.delete(pathKey);
        return next;
      });
      setAnalyzingFunctions((prev) => {
        const next = new Set(prev);
        next.delete(targetNode.name);
        return next;
      });
    }
  }, [
    addLog,
    fetchRepoFileContent,
    isRestoredFromHistory,
    persistCallgraphArtifact,
    repoInfo,
    triggerSave,
  ]);

  const runModuleAnalysis = useCallback(async (
    graphResult: CallgraphResult,
    info: RepoInfo & { stars?: number },
  ) => {
    const currentAnalysis = analysisResultRef.current;
    if (!currentAnalysis) return null;

    setWorkflowState({ state: "working", stage: "modules" });
    addLog(makeLogEntry("info", "模块划分：开始聚合函数节点并分析功能模块…"));

    try {
      const res = await fetch("/api/analyze/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoName: info.fullName,
          repoUrl: `https://github.com/${info.fullName}`,
          locale: analysisLocaleRef.current,
          summary: currentAnalysis.summary,
          description: info.description,
          languages: currentAnalysis.languages,
          techStack: currentAnalysis.techStack,
          functions: flattenCallgraphFunctions(graphResult),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const msg = (data as { error?: string }).error ?? "模块划分失败";
        addLog(makeLogEntry("warning", `模块划分失败：${msg}`));
        return null;
      }

      const result = data as ModuleAnalysisResult;
      setModuleAnalysis(result);
      moduleAnalysisRef.current = result;
      setSelectedModuleId(null);
      addLog(makeLogEntry(
        "success",
        `模块划分完成：共 ${result.modules.length} 个功能模块${result.savedFilePath ? `，已保存到 ${result.savedFilePath}` : ""}`,
      ));
      return result;
    } catch {
      addLog(makeLogEntry("warning", "模块划分：网络请求失败"));
      return null;
    }
  }, [addLog]);

  useEffect(() => {
    runModuleAnalysisRef.current = runModuleAnalysis;
  }, [runModuleAnalysis]);

  const runCallgraphAnalysis = useCallback(async (
    confirmedPath: string,
    fileContent: string,
    info: RepoInfo & { stars?: number },
    descriptionLocale: AnalysisLocale = callgraphDescriptionLocaleRef.current,
  ) => {
    const currentAnalysis = analysisResultRef.current;
    confirmedEntryContextRef.current = { path: confirmedPath, fileContent, info };
    setWorkflowState({ state: "working", stage: "callgraph" });
    setCallgraphLoading(true);
    setCallgraphResult(null);
    setAnalyzingFunctions(new Set());
    setManualDrilldownPaths(new Set());
    drilldownCacheRef.current.clear();

    const allFilePaths = filterCodeFiles(info.tree);
    addLog(makeLogEntry("info", `调用图分析：开始分析 ${confirmedPath} 的关键子函数…`));

    try {
      const callgraphRequest = {
        repoName: info.fullName,
        filePath: confirmedPath,
        fileContent,
        allFilePaths,
        languages: currentAnalysis?.languages.map((item) => ({
          name: item.name,
          percentage: item.percentage,
        })),
        techStack: currentAnalysis?.techStack,
        summary: currentAnalysis?.summary ?? null,
        description: info.description ?? currentAnalysis?.summary ?? null,
        locale: descriptionLocale,
      };
      addLog(makeLogEntry("info", `调用图分析：请求关键子函数 ${confirmedPath}`, { request: callgraphRequest }));
      const res = await fetch("/api/analyze/callgraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(callgraphRequest),
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
        `调用图分析完成：${result.rootFunction} 识别到 ${result.children.length} 个关键子函数${result.bridge ? `，已启用 ${result.bridge.strategyName}` : ""}`,
        { response: data },
      ));
      if (result.bridge) {
        addLog(makeLogEntry("info", `桥接模式：${result.bridge.reason}`));
      }

      setWorkflowState({ state: "working", stage: "recursive" });
      const finalResult = await runRecursiveAnalysis(result, info, fileContent, descriptionLocale);
      setCallgraphResult(finalResult);
      callgraphCacheRef.current[descriptionLocale] = finalResult;

      const savedFilePath = await persistCallgraphArtifact(finalResult, info);
      if (savedFilePath) {
        addLog(makeLogEntry("success", `调用图工程文件已保存到 ${savedFilePath}`));
      }

      if (descriptionLocale === callgraphDescriptionLocaleRef.current && !moduleAnalysisRef.current) {
        await runModuleAnalysis(finalResult, info);
      }
      setWorkflowState({ state: "completed", stage: "complete" });
      if (descriptionLocale === "zh") {
        triggerSave(info);
      }
    } catch {
      setWorkflowState({ state: "error", stage: "error" });
      addLog(makeLogEntry("warning", "调用图分析：网络请求失败"));
    } finally {
      setCallgraphLoading(false);
    }
  }, [addLog, persistCallgraphArtifact, runModuleAnalysis, runRecursiveAnalysis, triggerSave]);

  const resolveConfirmedEntryContext = useCallback(async () => {
    if (confirmedEntryContextRef.current) {
      return confirmedEntryContextRef.current;
    }

    if (!repoInfo) {
      return null;
    }

    const confirmedPath = Object.entries(entryCheckResultsRef.current).find(([, result]) => result.isEntry)?.[0];
    if (!confirmedPath) {
      return null;
    }

    const node = findNodeByPath(repoInfo.tree, confirmedPath);
    if (!node || node.type !== "blob") {
      return null;
    }

    try {
      const params = new URLSearchParams({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        path: node.path,
        sha: node.sha,
      });
      const res = await fetch(`/api/github/file?${params}`);
      const data = await res.json() as { content?: string; error?: string };
      if (!res.ok || !data.content) {
        return null;
      }

      const context = {
        path: confirmedPath,
        fileContent: data.content,
        info: repoInfo,
      };
      confirmedEntryContextRef.current = context;
      return context;
    } catch {
      return null;
    }
  }, [repoInfo]);

  const handleCallgraphDescriptionLocaleChange = useCallback(async (locale: AnalysisLocale) => {
    setCallgraphDescriptionLocale(locale);

    const cached = callgraphCacheRef.current[locale];
    if (cached) {
      setCallgraphResult(cached);
      return;
    }

    const entryContext = await resolveConfirmedEntryContext();
    if (!entryContext) {
      return;
    }

    await runCallgraphAnalysis(entryContext.path, entryContext.fileContent, entryContext.info, locale);
  }, [resolveConfirmedEntryContext, runCallgraphAnalysis]);

  const runEntryAnalysis = useCallback(async (
    entryFiles: AnalysisResult["entryFiles"],
    info: RepoInfo & { stars?: number },
    languages: AnalysisResult["languages"],
  ) => {
    setWorkflowState({ state: "working", stage: "entry" });
    setEntryCheckResults({});
    let confirmedEntryFound = false;

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
            locale: analysisLocaleRef.current,
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
          confirmedEntryFound = true;
          // Kick off callgraph analysis with the confirmed entry file content
          await runCallgraphAnalysis(entry.path, truncated, info);
          break;
        }
      } catch {
        addLog(makeLogEntry("warning", `入口研判：${entry.path} 请求失败`));
      }
    }

    setCheckingEntryPath(null);
    if (!confirmedEntryFound) {
      setWorkflowState({ state: "completed", stage: "complete" });
    }
  }, [addLog, runCallgraphAnalysis]);

  const fetchAnalysis = useCallback(async (info: RepoInfo & { stars?: number }, locale: AnalysisLocale) => {
    setWorkflowState({ state: "working", stage: "analysis" });
    const allPaths = filterCodeFiles(info.tree);

    addLog(makeLogEntry(
      "info",
      `代码文件过滤：共 ${allPaths.length} 个代码文件（已排除图片、lock 文件等）`
    ));

    if (allPaths.length === 0) {
      setWorkflowState({ state: "completed", stage: "complete" });
      return;
    }

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
          repoContext: {
            description: info.description,
            homepage: info.homepage,
            primaryLanguage: info.primaryLanguage,
            license: info.license,
            topics: info.topics,
            branch: info.branch,
            stars: info.stars,
            forks: info.forks,
            openIssues: info.openIssues,
            updatedAt: info.updatedAt,
          },
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const msg = (data as { error?: string }).error || "分析失败";
        setAnalysisError(msg);
        setWorkflowState({ state: "error", stage: "error" });
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
      } else {
        setWorkflowState({ state: "completed", stage: "complete" });
      }
    } catch {
      const msg = "网络错误，AI 分析请求失败";
      setAnalysisError(msg);
      setWorkflowState({ state: "error", stage: "error" });
      addLog(makeLogEntry("error", msg));
    } finally {
      setAnalysisLoading(false);
    }
  }, [addLog, runEntryAnalysis]);

  const fetchTree = useCallback(async (url: string) => {
    analyzeUrlRef.current = url;
    setWorkflowState({ state: "working", stage: "tree" });
    const parsed = parseGithubUrl(url);
    if (!parsed) {
      setInputError(text.invalidUrl);
      setWorkflowState({ state: "error", stage: "error" });
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
    setCallgraphDescriptionLocale("zh");
    setCallgraphLoading(false);
    setAnalyzingFunctions(new Set());
    setManualDrilldownPaths(new Set());
    setModuleAnalysis(null);
    setSelectedModuleId(null);
    drilldownCacheRef.current.clear();
    callgraphCacheRef.current = {};
    confirmedEntryContextRef.current = null;
    setLogs([makeLogEntry("success", `GitHub URL 校验通过：${parsed.owner}/${parsed.repo}`)]);

    try {
      const res = await fetch(`/api/github/tree?url=${encodeURIComponent(url)}`);
      const data = await res.json();

      if (!res.ok) {
        const msg = (data as { error?: string }).error || text.repoLoadFailed;
        setTreeError(msg);
        setWorkflowState({ state: "error", stage: "error" });
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
      setWorkflowState({ state: "error", stage: "error" });
      addLog(makeLogEntry("error", msg));
    } finally {
      setTreeLoading(false);
    }
  }, [addLog, fetchAnalysis, text.invalidUrl, text.networkRetry, text.repoLoadFailed]);

  const restoreFromRecord = useCallback((record: AnalysisRecord) => {
    setInputUrl(record.url);
    setInputError("");
    setIsRestoredFromHistory(true);
    setCurrentRecordId(record.id);

    const info = {
      owner: record.repoMeta.owner,
      repo: record.repoMeta.repo,
      branch: record.repoMeta.branch,
      fullName: record.repoMeta.fullName,
      description: record.repoMeta.description,
      homepage: record.repoMeta.homepage,
      primaryLanguage: record.repoMeta.primaryLanguage,
      license: record.repoMeta.license,
      topics: record.repoMeta.topics,
      stars: record.repoMeta.stars,
      forks: record.repoMeta.forks,
      openIssues: record.repoMeta.openIssues,
      updatedAt: record.repoMeta.updatedAt,
      tree: record.fileTree,
    };
    setRepoInfo(info);
    setTreeLoading(false);
    setTreeError(null);
    setSelectedPath(null);
    setFileContent(null);
    setAnalysisResult(record.analysisResult);
    setAnalysisCache({ [analysisLocaleRef.current]: record.analysisResult });
    setAnalysisError(null);
    setAnalysisLoading(false);
    setEntryCheckResults(record.entryCheckResults);
    setCheckingEntryPath(null);
    setCallgraphResult(record.callgraphResult);
    setCallgraphDescriptionLocale("zh");
    setModuleAnalysis(record.moduleAnalysis ?? null);
    setSelectedModuleId(null);
    setCallgraphLoading(false);
    setAnalyzingFunctions(new Set());
    setManualDrilldownPaths(new Set());
    callgraphCacheRef.current = {};
    confirmedEntryContextRef.current = null;
    setLogs(record.logs);
    setWorkflowState({ state: "completed", stage: "complete" });
  }, []);

  useEffect(() => {
    const url = searchParams.get("url");
    const historyId = searchParams.get("historyId");
    if (historyId) {
      const record = getRecordById(historyId);
      if (record) { restoreFromRecord(record); return; }
    }
    if (url) {
      setInputUrl(url);
      fetchTree(url);
    }
  }, [fetchTree, searchParams, restoreFromRecord]);

  const handleAnalyze = () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setInputError(text.emptyUrl);
      return;
    }
    setIsRestoredFromHistory(false);
    setCurrentRecordId(null);
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
            {isRestoredFromHistory && (
              <button
                onClick={() => {
                  setIsRestoredFromHistory(false);
                  setCurrentRecordId(null);
                  fetchTree(inputUrl);
                }}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors"
                style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
                title="Re-analyze this repository"
              >
                <RefreshCcw size={11} />
                Re-analyze
              </button>
            )}
            {currentRecordId !== null && (
              <button
                onClick={() => {
                  const record = getRecordById(currentRecordId);
                  if (!record) return;
                  const md = buildMarkdown(record);
                  downloadMarkdown(`panocode-${repoInfo.fullName.replace("/", "-")}.md`, md);
                }}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors"
                style={{ color: "var(--muted)", borderColor: "var(--border)" }}
                title="Export analysis as Markdown"
              >
                <Download size={11} />
                Export MD
              </button>
            )}
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
            workflowStatus={{
              state: workflowState.state,
              label: WORKFLOW_LABELS[analysisLocale][workflowState.stage],
            }}
          />

          {/* Scrollable bottom: description + AI analysis */}
          <div className="flex-1 overflow-auto flex flex-col">
            {(analysisLoading || analysisError || analysisResult) && (
              <AnalysisPanel
                loading={analysisLoading}
                error={analysisError}
                result={analysisResult}
                repoInfo={repoInfo}
                moduleAnalysis={moduleAnalysis}
                callgraphBridge={callgraphResult?.bridge ?? null}
                selectedModuleId={selectedModuleId}
                locale={analysisLocale}
                onLocaleChange={handleAnalysisLocaleChange}
                onFileClick={handleEntryFileClick}
                onModuleSelect={setSelectedModuleId}
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
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--code-bg)", minWidth: 280 }}>
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
            moduleAnalysis={moduleAnalysis}
            selectedModuleId={selectedModuleId}
            locale={analysisLocale}
            descriptionLocale={callgraphDescriptionLocale}
            onDescriptionLocaleChange={handleCallgraphDescriptionLocaleChange}
            onFileClick={handleEntryFileClick}
            onManualDrilldown={handleManualDrilldown}
            analyzingFunctions={analyzingFunctions}
            manualDrilldownPaths={manualDrilldownPaths}
            repoName={repoInfo?.fullName}
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
