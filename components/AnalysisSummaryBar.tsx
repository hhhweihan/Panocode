"use client";

import { Blocks, FileCode2, FolderOpen, Github, Languages, Network, Sparkles } from "lucide-react";
import type { AnalysisResult } from "@/app/api/analyze/route";
import type { EntryCheckResult } from "@/app/api/analyze/entry/route";
import type { CallgraphResult, CallgraphNode } from "@/app/api/analyze/callgraph/route";
import type { RepoInfo } from "@/lib/github";
import type { ModuleAnalysisResult } from "@/lib/moduleAnalysis";
import { getAverageTokensPerCall, type AnalysisUsageStats } from "@/lib/usage";

type WorkflowStatus = {
  state: "idle" | "working" | "completed" | "error";
  label: string;
};

interface AnalysisSummaryBarProps {
  locale: "zh" | "en";
  repoInfo: (RepoInfo & { source?: "github" | "local"; displayName?: string; localPath?: string | null }) | null;
  analysisResult: AnalysisResult | null;
  callgraphResult: CallgraphResult | null;
  moduleAnalysis: ModuleAnalysisResult | null;
  entryCheckResults: Record<string, EntryCheckResult>;
  usageStats: AnalysisUsageStats;
  workflowStatus: WorkflowStatus;
  isSnapshot: boolean;
}

const TEXT = {
  zh: {
    title: "分析摘要 · Overview",
    sourceGithub: "GitHub 仓库",
    sourceLocal: "本地项目",
    entry: "入口文件",
    language: "主语言",
    graph: "调用节点",
    modules: "功能模块",
    usage: "模型用量",
    calls: "调用",
    total: "总量",
    avg: "均值",
    snapshot: "历史快照",
    live: "实时分析",
    none: "待生成",
  },
  en: {
    title: "Overview · Analysis Summary",
    sourceGithub: "GitHub Repository",
    sourceLocal: "Local Workspace",
    entry: "Entry",
    language: "Primary Language",
    graph: "Callgraph Nodes",
    modules: "Modules",
    usage: "Model Usage",
    calls: "Calls",
    total: "Total",
    avg: "Avg",
    snapshot: "Snapshot",
    live: "Live",
    none: "Pending",
  },
} as const;

function countNodes(children: CallgraphNode[]) {
  let total = 0;

  function walk(nodes: CallgraphNode[]) {
    for (const node of nodes) {
      total += 1;
      if (node.children?.length) {
        walk(node.children);
      }
    }
  }

  walk(children);
  return total;
}

export default function AnalysisSummaryBar({
  locale,
  repoInfo,
  analysisResult,
  callgraphResult,
  moduleAnalysis,
  entryCheckResults,
  usageStats,
  workflowStatus,
  isSnapshot,
}: AnalysisSummaryBarProps) {
  const text = TEXT[locale];

  const confirmedEntry = Object.entries(entryCheckResults).find(([, value]) => value.isEntry)?.[0]
    ?? callgraphResult?.entryFile
    ?? analysisResult?.entryFiles[0]?.path
    ?? null;
  const primaryLanguage = analysisResult?.languages[0]?.name ?? repoInfo?.primaryLanguage ?? text.none;
  const nodeCount = callgraphResult ? countNodes(callgraphResult.children) : null;
  const moduleCount = moduleAnalysis?.modules.length ?? null;
  const sourceLabel = repoInfo?.source === "local" ? text.sourceLocal : text.sourceGithub;
  const averageTokens = getAverageTokensPerCall(usageStats);

  const metrics = [
    {
      label: text.entry,
      value: confirmedEntry ?? text.none,
      icon: FileCode2,
    },
    {
      label: text.language,
      value: primaryLanguage,
      icon: Languages,
    },
    {
      label: text.graph,
      value: nodeCount === null ? text.none : String(nodeCount),
      icon: Network,
    },
    {
      label: text.modules,
      value: moduleCount === null ? text.none : String(moduleCount),
      icon: Blocks,
    },
  ] as const;

  return (
    <section
      className="shrink-0 border-b px-3 py-2"
      style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--panel) 92%, transparent)" }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <div className="flex items-center gap-1.5">
          <Sparkles size={12} style={{ color: "var(--accent)" }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            {text.title}
          </span>
        </div>
        <span
          className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
          style={{ color: "var(--muted)", borderColor: "var(--border)", background: "var(--panel-2)" }}
        >
          {repoInfo?.source === "local" ? <FolderOpen size={10} className="mr-1 inline" /> : <Github size={10} className="mr-1 inline" />}
          {sourceLabel}
        </span>
        <span
          className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
          style={{
            color: workflowStatus.state === "error"
              ? "var(--error)"
              : workflowStatus.state === "completed"
                ? "var(--success)"
                : workflowStatus.state === "working"
                  ? "var(--accent)"
                  : "var(--muted)",
            borderColor: "var(--border)",
            background: "var(--panel-2)",
          }}
        >
          {workflowStatus.label}
        </span>
        <span
          className="rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider"
          style={{ color: "var(--muted)", borderColor: "var(--border)", background: "var(--panel-2)" }}
        >
          {isSnapshot ? text.snapshot : text.live}
        </span>
        {analysisResult?.techStack?.slice(0, 2).map((item) => (
          <span
            key={item.name}
            className="rounded-full border px-1.5 py-0.5 text-[10px]"
            style={{ color: "var(--muted)", borderColor: "var(--border)", background: "var(--panel-2)" }}
          >
            {item.name}
          </span>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className="rounded-lg border px-2.5 py-2"
              style={{ borderColor: "var(--border)", background: "var(--panel)" }}
            >
              <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                <Icon size={11} />
                <span>{metric.label}</span>
              </div>
              <div className="truncate text-[13px] font-medium leading-5" style={{ color: "var(--text)" }} title={metric.value}>
                {metric.value}
              </div>
            </div>
          );
        })}

        <div
          className="rounded-lg border px-2.5 py-2"
          style={{ borderColor: "var(--border)", background: "var(--panel)" }}
        >
          <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            <Sparkles size={11} />
            <span>{text.usage}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[12px] leading-5" style={{ color: "var(--text)" }}>
            <div>
              <div style={{ color: "var(--muted)" }}>{text.calls}</div>
              <div className="font-medium">{usageStats.modelCallCount > 0 ? usageStats.modelCallCount.toLocaleString() : "0"}</div>
            </div>
            <div>
              <div style={{ color: "var(--muted)" }}>{text.total}</div>
              <div className="font-medium">{usageStats.totalTokens > 0 ? usageStats.totalTokens.toLocaleString() : "0"}</div>
            </div>
            <div>
              <div style={{ color: "var(--muted)" }}>{text.avg}</div>
              <div className="font-medium">{averageTokens > 0 ? averageTokens.toLocaleString() : "0"}</div>
            </div>
          </div>
        </div>
      </div>

      {analysisResult?.summary && (
        <p
          className="mt-2 text-xs leading-5"
          style={{
            color: "var(--muted)",
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {analysisResult.summary}
        </p>
      )}
    </section>
  );
}