"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseGithubUrl } from "@/lib/github";
import { ArrowRight, Blocks, FolderOpen, Github, GitBranch, History, Network, Trash2, Upload } from "lucide-react";
import { useRuntimeSettings } from "@/components/RuntimeSettingsProvider";
import {
  subscribeHistorySummaries,
  getHistorySummariesSnapshot,
  getEmptyHistorySummaries,
} from "@/lib/storage";
import type { AnalysisRecordSummary } from "@/lib/storage";
import * as localFileStore from "@/lib/localFileStore";
import * as localArchiveStore from "@/lib/localArchiveStore";
import { buildLocalArchive } from "@/lib/localArchiveBuilder";
import {
  clearArchivesFromIndexedDb,
  listArchiveSummaries,
  removeArchiveFromIndexedDb,
  saveArchiveToIndexedDb,
  type LocalArchiveSummary,
} from "@/lib/localArchivePersistence";
import { RUNTIME_SETTINGS_OPEN_EVENT } from "@/lib/runtimeSettings";

function canUseServerLocalPathAccess() {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location.hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function supportsDirectoryPicker() {
  if (typeof window === "undefined") {
    return false;
  }

  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

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
          {isLocal ? (
            <FolderOpen size={13} style={{ color: "var(--muted)", flexShrink: 0 }} />
          ) : (
            <Github size={13} style={{ color: "var(--muted)", flexShrink: 0 }} />
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
      <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
        {isLocal ? "本地项目 · Local" : "GitHub 仓库 · GitHub"}
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

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hydrated: settingsHydrated, isAnalysisReady, missingRequiredSettings } = useRuntimeSettings();
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
  const [localPickerMode, setLocalPickerMode] = useState<"server" | "client" | "archive">("server");
  const [localArchiveLoading, setLocalArchiveLoading] = useState(false);
  const [isArchiveDragActive, setIsArchiveDragActive] = useState(false);
  const [cachedArchives, setCachedArchives] = useState<LocalArchiveSummary[]>([]);
  const [archiveCacheLoading, setArchiveCacheLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const archiveInputRef = useRef<HTMLInputElement | null>(null);

  const valueProps = [
    {
      icon: Network,
      title: "入口识别 · Entry Flow",
      description: "快速判断项目从哪里启动，先读对入口。",
    },
    {
      icon: GitBranch,
      title: "调用全景 · Call Graph",
      description: "沿关键路径展开主流程，减少盲目跳转。",
    },
    {
      icon: Blocks,
      title: "模块归类 · Modules",
      description: "把函数和能力分组，先看结构再看细节。",
    },
  ] as const;

  const githubHistory = useMemo(
    () => history.filter((item) => (item.source ?? "github") !== "local").slice(0, 6),
    [history],
  );
  const localHistory = useMemo(
    () => history.filter((item) => (item.source ?? "github") === "local").slice(0, 6),
    [history],
  );
  const missingSettingLabels = useMemo(() => {
    const labelMap: Record<string, string> = {
      aiBaseUrl: "AI Base URL",
      aiApiKey: "AI API Key",
      aiModel: "AI 模型名称",
    };

    return missingRequiredSettings.map((field) => labelMap[field] ?? field);
  }, [missingRequiredSettings]);
  const showConfigGuard = searchParams.get("config") === "required" || !isAnalysisReady;
  const browserCanPickDirectory = mounted && supportsDirectoryPicker();
  const canUseLocalPathInput = mounted && canUseServerLocalPathAccess();
  const localPathUnavailableMessage = "当前站点部署在远端服务器，不能直接读取你电脑上的本地路径。请改用“选择文件夹”，或在本机启动 Panocode。";
  const localPickerUnavailableMessage = "当前浏览器不支持文件夹授权，且远端部署不能直接读取你电脑上的本地路径。请改用支持 File System Access API 的浏览器，或在本机启动 Panocode。";
  const localArchiveUnavailableMessage = "请先上传 ZIP 压缩包，再开始分析。";

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    if (!canUseServerLocalPathAccess()) {
      setLocalPickerMode("client");
    }
  }, [mounted]);

  const refreshCachedArchives = useCallback(async () => {
    if (!mounted) {
      return;
    }

    setArchiveCacheLoading(true);
    try {
      const records = await listArchiveSummaries();
      setCachedArchives(records);
    } catch {
      setCachedArchives([]);
    } finally {
      setArchiveCacheLoading(false);
    }
  }, [mounted]);

  useEffect(() => {
    if (activeTab !== "local") {
      return;
    }

    refreshCachedArchives();
  }, [activeTab, refreshCachedArchives]);

  const openRuntimeSettings = () => {
    window.dispatchEvent(new Event(RUNTIME_SETTINGS_OPEN_EVENT));
  };

  const handleAnalyze = () => {
    if (!settingsHydrated) {
      return;
    }

    if (!isAnalysisReady) {
      setError(`请先完成 AI 配置：${missingSettingLabels.join(" / ")}`);
      openRuntimeSettings();
      return;
    }

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
    if (!settingsHydrated) {
      return;
    }

    if (!isAnalysisReady) {
      setLocalError(`请先完成 AI 配置：${missingSettingLabels.join(" / ")}`);
      openRuntimeSettings();
      return;
    }

    if (localPickerMode === "server" && !canUseServerLocalPathAccess()) {
      setLocalError(localPathUnavailableMessage);
      return;
    }

    if (!localPath.trim() && localPickerMode === "server") {
      setLocalError("请输入本地项目路径");
      return;
    }

    if (localPickerMode === "client") {
      const handle = localFileStore.getHandle();
      if (!handle) {
        setLocalError(browserCanPickDirectory ? "请先点击“选择文件夹”授权浏览器访问本地目录" : localPickerUnavailableMessage);
        return;
      }
    }

    if (localPickerMode === "archive" && !localArchiveStore.getArchive()) {
      setLocalError(localArchiveUnavailableMessage);
      return;
    }

    setLocalError("");
    if (localPickerMode === "client") {
      const name = localPath || "local-project";
      router.push(`/analyze?source=local&mode=client&name=${encodeURIComponent(name)}`);
    } else if (localPickerMode === "archive") {
      const archive = localArchiveStore.getArchive();
      const name = localPath || archive?.name || "local-archive";
      const archiveKey = archive?.key;
      router.push(
        `/analyze?source=local&mode=archive&name=${encodeURIComponent(name)}${archiveKey ? `&archiveKey=${encodeURIComponent(archiveKey)}` : ""}`,
      );
    } else {
      router.push(`/analyze?source=local&path=${encodeURIComponent(localPath.trim())}`);
    }
  };

  const handlePickerClick = async () => {
    type WinWithPicker = Window & { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> };
    if (!supportsDirectoryPicker()) {
      return;
    }
    try {
      const handle = await (window as unknown as WinWithPicker).showDirectoryPicker();
      localArchiveStore.clearArchive();
      localFileStore.setHandle(handle);
      setLocalPath(handle.name);
      setLocalPickerMode("client");
      setLocalError("");
    } catch {
      // User cancelled — no-op
    }
  };

  const handleLocalPathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canUseLocalPathInput) {
      return;
    }

    setLocalPath(e.target.value);
    setLocalPickerMode("server");
    localFileStore.clearHandle();
    localArchiveStore.clearArchive();
    if (localError) setLocalError("");
  };

  const handleArchiveButtonClick = () => {
    archiveInputRef.current?.click();
  };

  const processLocalArchiveFile = async (file: File) => {
    setLocalArchiveLoading(true);
    setLocalError("");

    try {
      const archive = await buildLocalArchive(file);
      localFileStore.clearHandle();
      localArchiveStore.setArchive(archive);
      await saveArchiveToIndexedDb(archive);
      await refreshCachedArchives();
      setLocalPath(archive.name);
      setLocalPickerMode("archive");
      router.push(`/analyze?source=local&mode=archive&name=${encodeURIComponent(archive.name)}&archiveKey=${encodeURIComponent(archive.key)}`);
    } catch {
      localArchiveStore.clearArchive();
      setLocalError("ZIP 解析失败，请确认上传的是有效的项目压缩包。");
    } finally {
      setLocalArchiveLoading(false);
    }
  };

  const handleArchiveSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file) {
      return;
    }

    await processLocalArchiveFile(file);
  };

  const handleArchiveDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsArchiveDragActive(true);
  };

  const handleArchiveDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) {
      return;
    }
    setIsArchiveDragActive(false);
  };

  const handleArchiveDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsArchiveDragActive(false);

    const file = Array.from(e.dataTransfer.files).find((item) => item.name.toLowerCase().endsWith(".zip"));
    if (!file) {
      setLocalError("请拖入 ZIP 压缩包。");
      return;
    }

    await processLocalArchiveFile(file);
  };

  const handleCachedArchiveOpen = (archive: LocalArchiveSummary) => {
    setLocalError("");
    setLocalPickerMode("archive");
    setLocalPath(archive.name);
    router.push(`/analyze?source=local&mode=archive&name=${encodeURIComponent(archive.name)}&archiveKey=${encodeURIComponent(archive.key)}`);
  };

  const handleCachedArchiveRemove = async (archive: LocalArchiveSummary) => {
    await removeArchiveFromIndexedDb(archive.key);
    if (localArchiveStore.getArchive()?.key === archive.key) {
      localArchiveStore.clearArchive();
      if (localPickerMode === "archive") {
        setLocalPath("");
      }
    }
    await refreshCachedArchives();
  };

  const handleClearCachedArchives = async () => {
    await clearArchivesFromIndexedDb();
    localArchiveStore.clearArchive();
    if (localPickerMode === "archive") {
      setLocalPath("");
    }
    await refreshCachedArchives();
  };

  const formatArchiveSavedAt = (value: number) => {
    return new Date(value).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const examples = ["microsoft/vscode", "hhhweihan/EasyTshark"];

  const handleHistoryOpen = (item: AnalysisRecordSummary) => {
    const isLocal = (item.source ?? "github") === "local";
    if (!isLocal) {
      router.push(`/analyze?url=${encodeURIComponent(item.url)}&historyId=${item.id}`);
      return;
    }

    if (item.url.startsWith("local-archive:")) {
      const archiveToken = item.url.slice("local-archive:".length);
      const firstColon = archiveToken.indexOf(":");
      const archiveKey = firstColon >= 0 ? archiveToken.slice(0, firstColon) : "";
      const displayName = firstColon >= 0 ? archiveToken.slice(firstColon + 1) : archiveToken || item.repoName;
      router.push(
        `/analyze?source=local&mode=archive&name=${encodeURIComponent(displayName)}${archiveKey ? `&archiveKey=${encodeURIComponent(archiveKey)}` : ""}&historyId=${item.id}`,
      );
      return;
    }

    if (item.url.startsWith("local:")) {
      const displayName = item.url.slice("local:".length) || item.repoName;
      router.push(
        `/analyze?source=local&mode=client&name=${encodeURIComponent(displayName)}&historyId=${item.id}`,
      );
      return;
    }

    router.push(`/analyze?source=local&path=${encodeURIComponent(item.url)}&historyId=${item.id}`);
  };

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
          <Image src="/hi-mark.svg" alt="Hi" width={56} height={56} priority />
        </div>

        <div
          className="mb-4 inline-flex items-center rounded-full border px-3 py-1 text-xs tracking-[0.18em] uppercase"
          style={{
            borderColor: "var(--border)",
            background: "var(--panel)",
            color: "var(--muted)",
          }}
        >
          AI Codebase Explorer
        </div>

        {/* Title */}
        <h1
          className="text-6xl font-bold mb-3"
          style={{ letterSpacing: "-0.03em" }}
        >
          <span style={{ color: "var(--text)" }}>Pano</span>
          <span style={{ color: "var(--accent)" }}>code</span>
        </h1>

        <p className="text-lg mb-8 leading-relaxed" style={{ color: "var(--muted)" }}>
          <span className="block">把陌生代码库，变成一张可读的全景图</span>
          <span className="block text-base opacity-80">
            Paste a repo or open a folder to understand structure, entry flow, and call graphs faster
          </span>
        </p>

        {showConfigGuard && (
          <div
            className="mb-8 w-full rounded-2xl border px-4 py-4 text-left"
            style={{
              borderColor: "color-mix(in srgb, var(--warning, #f59e0b) 42%, var(--border))",
              background: "color-mix(in srgb, var(--warning, #f59e0b) 10%, var(--panel))",
            }}
          >
            <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              {searchParams.get("config") === "required"
                ? "已拦截进入分析页，请先完成 AI 配置"
                : "开始分析前，请先完成 AI 配置"}
            </div>
            <p className="mt-1 text-xs leading-6" style={{ color: "var(--muted)" }}>
              当前缺少 {missingSettingLabels.join(" / ")}。配置会保存在浏览器本地，也支持环境变量覆盖。
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={openRuntimeSettings}
                className="rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
                style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
              >
                立即配置
              </button>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                配置完成后留在首页，继续输入仓库地址或本地路径即可。
              </span>
            </div>
          </div>
        )}

        <div className="grid w-full grid-cols-1 gap-3 mb-8 sm:grid-cols-3">
          {valueProps.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-2xl border px-4 py-4 text-left"
                style={{
                  borderColor: "var(--border)",
                  background: "color-mix(in srgb, var(--panel) 82%, transparent)",
                }}
              >
                <div className="mb-3 flex items-center gap-2">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg border"
                    style={{
                      borderColor: "color-mix(in srgb, var(--accent) 28%, var(--border))",
                      background: "color-mix(in srgb, var(--accent) 10%, transparent)",
                      color: "var(--accent)",
                    }}
                  >
                    <Icon size={15} />
                  </div>
                  <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
                    {item.title}
                  </span>
                </div>
                <p className="text-xs leading-6" style={{ color: "var(--muted)" }}>
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mb-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          {(["github", "local"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="rounded-2xl border px-4 py-4 text-left transition-colors"
              style={{
                color: activeTab === tab ? "var(--text)" : "var(--muted)",
                borderColor: activeTab === tab ? "var(--accent)" : "var(--border)",
                background: activeTab === tab
                  ? "color-mix(in srgb, var(--accent) 10%, var(--panel))"
                  : "var(--panel)",
              }}
            >
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                {tab === "github"
                  ? <Github size={16} style={{ color: activeTab === tab ? "var(--accent)" : "var(--muted)" }} />
                  : <FolderOpen size={16} style={{ color: activeTab === tab ? "var(--accent)" : "var(--muted)" }} />}
                <span>{tab === "github" ? "分析 GitHub 仓库" : "打开本地项目"}</span>
              </div>
              <div className="text-xs leading-6" style={{ color: activeTab === tab ? "var(--text)" : "var(--muted)" }}>
                {tab === "github"
                  ? "粘贴仓库链接，快速获得结构概览、入口判断与调用图。"
                  : "输入路径或直接选文件夹，立即开始浏览结构和源码。"}
              </div>
            </button>
          ))}
        </div>

        <p className="mb-5 text-sm" style={{ color: "var(--muted)" }}>
          {activeTab === "github"
            ? "粘贴仓库地址，快速获得结构概览、入口判断与调用图"
            : "打开你的本地项目，直接浏览结构、源码与关键调用路径"}
        </p>

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
                placeholder="粘贴 GitHub 仓库地址，例如 https://github.com/microsoft/vscode"
                className="flex-1 bg-transparent outline-none text-base"
                style={{ color: "var(--text)" }}
                autoFocus
              />
              <button
                onClick={handleAnalyze}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
                style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
              >
                立即分析
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
                快速体验 · Try these
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
          <div
            data-testid="local-archive-dropzone"
            className="w-full rounded-2xl transition-colors"
            onDragOver={handleArchiveDragOver}
            onDragLeave={handleArchiveDragLeave}
            onDrop={handleArchiveDrop}
            style={{
              border: isArchiveDragActive ? "1px dashed var(--accent)" : "1px dashed transparent",
              background: isArchiveDragActive ? "color-mix(in srgb, var(--accent) 6%, transparent)" : "transparent",
              padding: isArchiveDragActive ? "12px" : "0px",
              margin: isArchiveDragActive ? "-12px" : "0px",
            }}
          >
            <div className="mb-3 flex flex-wrap gap-2">
              {browserCanPickDirectory && (
                <button
                  onClick={handlePickerClick}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors"
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

              <button
                onClick={handleArchiveButtonClick}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--panel)",
                  color: "var(--text)",
                }}
              >
                <Upload size={16} />
                上传 ZIP
              </button>

              <input
                ref={archiveInputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={handleArchiveSelected}
              />
            </div>

            <div
              className="flex items-center gap-2 rounded-xl border px-4 py-3 transition-colors"
              style={{
                background: "var(--panel)",
                borderColor: localError ? "var(--error, #ef4444)" : "var(--border)",
              }}
            >
              {localPickerMode === "archive"
                ? <Upload size={18} style={{ color: "var(--muted)", flexShrink: 0 }} />
                : <FolderOpen size={18} style={{ color: "var(--muted)", flexShrink: 0 }} />}
              <input
                type="text"
                value={localPath}
                onChange={handleLocalPathChange}
                onKeyDown={(e) => { if (e.key === "Enter") handleLocalAnalyze(); }}
                placeholder={localPickerMode === "archive"
                  ? "已选择 ZIP 压缩包，可直接开始分析"
                  : (canUseLocalPathInput
                    ? "输入本地项目路径，例如 C:\\Users\\me\\my-project"
                    : (browserCanPickDirectory
                      ? "远端部署请先点击“选择文件夹”或“上传 ZIP”"
                      : "当前浏览器不支持文件夹授权，请上传 ZIP 或在本机启动 Panocode"
                    ))}
                className="flex-1 bg-transparent outline-none text-base"
                style={{ color: "var(--text)" }}
                readOnly={!canUseLocalPathInput || localPickerMode === "archive"}
              />
              <button
                onClick={handleLocalAnalyze}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-contrast)",
                  opacity: localArchiveLoading ? 0.7 : 1,
                }}
                disabled={localArchiveLoading}
              >
                {localArchiveLoading ? "解析 ZIP 中" : "立即分析"}
                <ArrowRight size={15} />
              </button>
            </div>

            {localError && (
              <p className="mt-2 text-sm text-left" style={{ color: "var(--error, #ef4444)" }}>
                {localError}
              </p>
            )}

            {!canUseLocalPathInput && (
              <p className="mt-2 text-xs text-left leading-6" style={{ color: "var(--muted)" }}>
                远端部署不能直接读取你电脑上的路径。可使用浏览器文件夹授权，或直接上传 ZIP 压缩包。
              </p>
            )}

            <p className="mt-2 text-xs text-left leading-6" style={{ color: "var(--muted)" }}>
              也可以直接把 ZIP 压缩包拖到这个区域。上传后的 ZIP 会缓存在当前浏览器里，刷新页面后仍可恢复。
            </p>

            {localPickerMode === "client" && localPath && (
              <p className="mt-2 text-xs text-left" style={{ color: "var(--muted)" }}>
                已选择文件夹：{localPath}（将在浏览器中直接读取）
              </p>
            )}

            {localPickerMode === "archive" && localPath && (
              <p className="mt-2 text-xs text-left" style={{ color: "var(--muted)" }}>
                已载入 ZIP：{localPath}（将在浏览器中解压并读取）
              </p>
            )}

            {isArchiveDragActive && (
              <p className="mt-3 text-sm text-left font-medium" style={{ color: "var(--accent)" }}>
                松开鼠标以上传 ZIP 并开始准备分析。
              </p>
            )}

            <div
              className="mt-4 rounded-2xl border px-4 py-4 text-left"
              style={{ borderColor: "var(--border)", background: "var(--panel)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                    ZIP 缓存管理
                  </div>
                  <p className="mt-1 text-xs leading-6" style={{ color: "var(--muted)" }}>
                    浏览器最多保留最近 5 个 ZIP，超出或超过 7 天会自动清理。
                  </p>
                </div>
                <button
                  onClick={handleClearCachedArchives}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors"
                  style={{ color: "var(--muted)", borderColor: "var(--border)" }}
                  disabled={cachedArchives.length === 0}
                >
                  <Trash2 size={13} />
                  清空缓存
                </button>
              </div>

              {archiveCacheLoading ? (
                <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
                  正在读取 ZIP 缓存...
                </p>
              ) : cachedArchives.length === 0 ? (
                <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
                  当前没有可恢复的 ZIP 缓存。
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {cachedArchives.map((archive) => (
                    <div
                      key={archive.key}
                      className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3"
                      style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>
                          {archive.name}
                        </div>
                        <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                          最近保存：{formatArchiveSavedAt(archive.savedAt)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => handleCachedArchiveOpen(archive)}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                          style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
                        >
                          打开
                        </button>
                        <button
                          onClick={() => handleCachedArchiveRemove(archive)}
                          className="rounded-lg border px-3 py-1.5 text-xs transition-colors"
                          style={{ color: "var(--muted)", borderColor: "var(--border)" }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                最近分析记录 · Recent sessions
              </span>
            </div>
            <div className="space-y-5">
              {githubHistory.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                    <Github size={12} />
                    <span>GitHub 仓库记录</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {githubHistory.map((item) => (
                      <HistoryCard
                        key={item.id}
                        summary={item}
                        onClick={() => handleHistoryOpen(item)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {localHistory.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                    <FolderOpen size={12} />
                    <span>本地项目记录</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {localHistory.map((item) => (
                      <HistoryCard
                        key={item.id}
                        summary={item}
                        onClick={() => handleHistoryOpen(item)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <HomePageContent />
    </Suspense>
  );
}
