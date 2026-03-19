"use client";

import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Download, FileJson, Image, Loader2, Minus, Network, Plus, RefreshCcw, Sparkles, ZoomIn, ZoomOut } from "lucide-react";
import type { CallgraphResult, CallgraphNode } from "@/app/api/analyze/callgraph/route";
import type { AnalysisLocale } from "@/components/AnalysisPanel";
import { serializeCallgraphPath } from "@/lib/callgraphUtils";
import { getFunctionModule, type ModuleAnalysisResult } from "@/lib/moduleAnalysis";
import { downloadPanoramaAsPng, downloadPanoramaAsSvg, downloadPanoramaAsJson } from "@/lib/panoramaExport";

// ── Layout constants ──────────────────────────────────────────────────────────

const ROOT_W = 260;
const ROOT_H = 90;
const CARD_W = 220;
const CARD_H = 102;
const COL_GAP = 64;         // horizontal gap between parent-right and child-left
const CARD_GAP = 12;        // vertical gap between sibling cards
const CONN_MARGIN = 20;     // connector vertical line is this far left of child column
const CANVAS_PAD_X = 20;
const CANVAS_PAD_Y = 20;
const ACTION_OFFSET_Y = 8;
const ACTION_LINE_H = 10;
const ACTION_SPACE_Y = ACTION_OFFSET_Y + ACTION_LINE_H + 30 + 8;
// drilldown button beside the card (right side)
const DRILL_LINE_W = 18;    // animated dashed line length
const DRILL_BTN_R = 14;     // button radius
const CANVAS_PAD_RIGHT = CANVAS_PAD_X + DRILL_LINE_W + DRILL_BTN_R * 2 + 8; // extra right space

// ── drillDown visuals ─────────────────────────────────────────────────────────

const DRILL_STYLE: Record<number, { dot: string; bg: string; border: string; text: string; desc: string; headerBg: string }> = {
  // drillDown=1 (重点): theme-adaptive via CSS vars (dark: green body, light: light-green bg)
  1:  { dot: "var(--card-key-dot)", bg: "var(--card-key-bg)", border: "var(--card-key-border)", text: "var(--card-key-text)", desc: "var(--card-key-desc)", headerBg: "var(--card-key-header)" },
  // drillDown=0 (normal): theme-aware
  0:  { dot: "#60a5fa", bg: "var(--panel)", border: "var(--border)", text: "var(--text)", desc: "var(--muted)", headerBg: "color-mix(in srgb, var(--hover) 60%, transparent)" },
  // drillDown=-1 (外部): slightly tinted bg for better visibility in light mode
  [-1]: { dot: "#6b7280", bg: "color-mix(in srgb, var(--border) 25%, var(--panel))", border: "var(--border)", text: "var(--text)", desc: "var(--muted)", headerBg: "color-mix(in srgb, var(--border) 40%, var(--panel))" },
};

const DRILL_LABEL = {
  zh: { 1: "重点", 0: "", [-1]: "外部" },
  en: { 1: "Key",  0: "", [-1]: "Ext." },
} as const;

// ── Text strings ──────────────────────────────────────────────────────────────

const TEXT = {
  zh: {
    title:   "全景图",
    loading: "分析调用图…",
    empty:   "入口确认后自动分析",
    reset:   "重置视图",
    zoomIn:  "放大",
    zoomOut: "缩小",
    noFile:  "—",
    endpoint: "URL",
    descriptionLanguage: "函数介绍",
    localeZh: "中文",
    localeEn: "English",
    expandAll: "全部展开",
    collapseAll: "全部收起",
    expandNode: "展开子节点",
    collapseNode: "收起子节点",
    continueDrilldown: "继续下钻",
    childrenCount: "子节点",
    rootChildrenCount: "首层节点",
    downloadPng: "下载 PNG",
    downloadSvg: "下载 SVG",
    downloadJson: "下载 JSON",
    downloading: "生成中…",
  },
  en: {
    title:   "Panorama",
    loading: "Analyzing call graph…",
    empty:   "Auto-runs after entry confirmed",
    reset:   "Reset view",
    zoomIn:  "Zoom in",
    zoomOut: "Zoom out",
    noFile:  "—",
    endpoint: "URL",
    descriptionLanguage: "Descriptions",
    localeZh: "中文",
    localeEn: "English",
    expandAll: "Expand all",
    collapseAll: "Collapse all",
    expandNode: "Expand children",
    collapseNode: "Collapse children",
    continueDrilldown: "Continue drilling",
    childrenCount: "children",
    rootChildrenCount: "top-level nodes",
    downloadPng: "Download PNG",
    downloadSvg: "Download SVG",
    downloadJson: "Download JSON",
    downloading: "Generating…",
  },
} as const;

// ── Tree layout ───────────────────────────────────────────────────────────────

interface LayoutNode {
  node: CallgraphNode;
  x: number;
  y: number;
  depth: number;
  path: number[];
}

function hasChildren(node: CallgraphNode): boolean {
  return (node.children?.length ?? 0) > 0;
}

function isCollapsed(path: number[], collapsedPaths: Set<string>): boolean {
  return collapsedPaths.has(serializeCallgraphPath(path));
}

/** Height of node's visible subtree (including descendants). */
function subtreeH(node: CallgraphNode, path: number[], collapsedPaths: Set<string>): number {
  const ch = node.children ?? [];
  if (ch.length === 0 || isCollapsed(path, collapsedPaths)) return CARD_H;
  const total = ch.reduce((sum, child, index) => sum + subtreeH(child, [...path, index], collapsedPaths), 0);
  return Math.max(CARD_H, total + (ch.length - 1) * CARD_GAP);
}

/** X position of the left edge of cards at a given depth. */
function colX(depth: number): number {
  return CANVAS_PAD_X + ROOT_W + COL_GAP + depth * (CARD_W + COL_GAP);
}

function computeLayout(result: CallgraphResult, collapsedPaths: Set<string>): {
  nodes: LayoutNode[];
  rootX: number;
  rootY: number;
  canvasW: number;
  canvasH: number;
} {
  const nodes: LayoutNode[] = [];

  // Total height is driven by depth-0 children
  const childrenTotalH =
    result.children.length === 0 || collapsedPaths.has("root")
      ? 0
      : result.children.reduce((sum, child, index) => sum + subtreeH(child, [index], collapsedPaths), 0) +
        (result.children.length - 1) * CARD_GAP;

  const mainH = Math.max(ROOT_H, childrenTotalH);
  const rootY = CANVAS_PAD_Y + (mainH - ROOT_H) / 2;
  const childrenStartY = CANVAS_PAD_Y + (mainH - childrenTotalH) / 2;

  function layout(
    children: CallgraphNode[],
    depth: number,
    yStart: number,
    parentPath: number[],
  ) {
    let cursor = yStart;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const path = [...parentPath, i];
      const h = subtreeH(child, path, collapsedPaths);
      const cardY = cursor + (h - CARD_H) / 2;
      nodes.push({ node: child, x: colX(depth), y: cardY, depth, path });
      if (hasChildren(child) && !isCollapsed(path, collapsedPaths)) {
        layout(child.children ?? [], depth + 1, cursor, path);
      }
      cursor += h + CARD_GAP;
    }
  }

  if (result.children.length > 0 && !collapsedPaths.has("root")) {
    layout(result.children, 0, childrenStartY, []);
  }

  const maxDepth = nodes.length > 0 ? Math.max(...nodes.map((n) => n.depth)) : -1;
  const canvasW =
    CANVAS_PAD_X + CANVAS_PAD_RIGHT +
    ROOT_W +
    (maxDepth >= 0 ? COL_GAP + (maxDepth + 1) * (CARD_W + COL_GAP) : 0);
  const canvasH = CANVAS_PAD_Y * 2 + mainH + ACTION_SPACE_Y;

  return { nodes, rootX: CANVAS_PAD_X, rootY, canvasW, canvasH };
}

// ── Connector data ────────────────────────────────────────────────────────────

interface ConnGroup {
  parentRightX: number;
  parentCenterY: number;
  connX: number;
  childLeftX: number;
  childCenterYs: number[];
}

function computeConnectors(
  result: CallgraphResult,
  layoutNodes: LayoutNode[],
  rootY: number,
  collapsedPaths: Set<string>,
): ConnGroup[] {
  const groups: ConnGroup[] = [];

  // Root → depth-0 children
  if (result.children.length > 0 && !collapsedPaths.has("root")) {
    const d0 = layoutNodes.filter((n) => n.depth === 0 && n.path.length === 1);
    groups.push({
      parentRightX: CANVAS_PAD_X + ROOT_W,
      parentCenterY: rootY + ROOT_H / 2,
      connX: colX(0) - CONN_MARGIN,
      childLeftX: colX(0),
      childCenterYs: d0.map((n) => n.y + CARD_H / 2),
    });
  }

  // Each interior node → its children
  for (const ln of layoutNodes) {
    if (!hasChildren(ln.node) || isCollapsed(ln.path, collapsedPaths)) continue;
    const childDepth = ln.depth + 1;
    const myChildren = layoutNodes.filter(
      (n) =>
        n.depth === childDepth &&
        n.path.length === ln.path.length + 1 &&
        n.path.slice(0, -1).every((value, index) => value === ln.path[index]),
    );
    if (myChildren.length === 0) continue;
    groups.push({
      parentRightX: colX(ln.depth) + CARD_W,
      parentCenterY: ln.y + CARD_H / 2,
      connX: colX(childDepth) - CONN_MARGIN,
      childLeftX: colX(childDepth),
      childCenterYs: myChildren.map((n) => n.y + CARD_H / 2),
    });
  }

  return groups;
}

function countCallgraphNodes(result: CallgraphResult): number {
  let total = 1;

  function walk(nodes: CallgraphNode[]) {
    for (const node of nodes) {
      total += 1;
      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    }
  }

  walk(result.children);
  return total;
}

function countDescendants(node: CallgraphNode): number {
  const children = node.children ?? [];
  return children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function countHiddenNodes(node: CallgraphNode, isNodeCollapsed: boolean): number {
  if (isNodeCollapsed) {
    return countDescendants(node);
  }

  return (node.children ?? []).reduce((sum, child) => sum + countHiddenNodes(child, false), 0);
}

function collectCollapsiblePaths(result: CallgraphResult): string[] {
  const keys: string[] = [];

  if (result.children.length > 0) {
    keys.push("root");
  }

  function walk(nodes: CallgraphNode[], parentPath: number[]) {
    nodes.forEach((node, index) => {
      const path = [...parentPath, index];
      if (hasChildren(node)) {
        keys.push(serializeCallgraphPath(path));
        walk(node.children ?? [], path);
      }
    });
  }

  walk(result.children, []);
  return keys;
}

function shouldShowContinueDrilldown(node: CallgraphNode): boolean {
  return !hasChildren(node) && node.drillDown !== -1;
}

// ── SVG Connectors ────────────────────────────────────────────────────────────

function Connectors({
  groups,
  canvasW,
  canvasH,
}: {
  groups: ConnGroup[];
  canvasW: number;
  canvasH: number;
}) {
  return (
    <svg
      style={{ position: "absolute", top: 0, left: 0, overflow: "visible", pointerEvents: "none" }}
      width={canvasW}
      height={canvasH}
    >
      {groups.map((g, gi) => {
        if (g.childCenterYs.length === 0) return null;
        const minY = Math.min(g.parentCenterY, ...g.childCenterYs);
        const maxY = Math.max(g.parentCenterY, ...g.childCenterYs);
        // Stagger animation delay per group for organic feel
        const delay = `${(gi * 0.18) % 1.2}s`;
        return (
          <g key={gi} stroke="var(--border)" strokeWidth={1.5} strokeDasharray="5 4" fill="none">
            <line
              x1={g.parentRightX} y1={g.parentCenterY} x2={g.connX} y2={g.parentCenterY}
              style={{ animation: `connFlow 1.8s linear ${delay} infinite` }}
            />
            <line
              x1={g.connX} y1={minY} x2={g.connX} y2={maxY}
              style={{ animation: `connFlow 1.8s linear ${delay} infinite` }}
            />
            {g.childCenterYs.map((cy, i) => (
              <line
                key={i} x1={g.connX} y1={cy} x2={g.childLeftX} y2={cy}
                style={{ animation: `connFlow 1.8s linear ${(parseFloat(delay) + i * 0.08).toFixed(2)}s infinite` }}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// ── Root node card ────────────────────────────────────────────────────────────

function RootCard({
  name,
  file,
  onClick,
  moduleColor,
  isDimmed,
  isHighlighted,
}: {
  name: string;
  file: string;
  onClick: () => void;
  moduleColor?: string | null;
  isDimmed: boolean;
  isHighlighted: boolean;
}) {
  const filename = file.split("/").pop() ?? file;
  return (
    <div
      onClick={onClick}
      style={{
        position: "absolute",
        width: ROOT_W,
        height: ROOT_H,
        cursor: "pointer",
        borderRadius: 10,
        overflow: "hidden",
        border: `1px solid ${moduleColor ?? "var(--card-key-border)"}`,
        background: "var(--root-card-bg)",
        boxShadow: isHighlighted
          ? `0 0 0 2px ${moduleColor ?? "var(--card-key-dot)"}, 0 4px 16px rgba(0,0,0,0.2)`
          : "0 4px 16px rgba(0,0,0,0.15)",
        opacity: isDimmed ? 0.22 : 1,
        filter: isDimmed ? "grayscale(1)" : "none",
      }}
    >
      <div
        style={{
          padding: "5px 10px",
          borderBottom: `1px solid ${moduleColor ?? "var(--card-key-border)"}`,
          background: moduleColor ?? "var(--root-card-header)",
          fontSize: 10,
          color: moduleColor ? "#ffffff" : "var(--card-key-text)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontFamily: "var(--font-geist-mono, monospace)",
        }}
      >
        {filename}
      </div>
      <div style={{ padding: "8px 10px" }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--root-card-name)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginBottom: 3,
            fontFamily: "var(--font-geist-mono, monospace)",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--root-card-file)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {file}
        </div>
      </div>
    </div>
  );
}

// ── Child node card ───────────────────────────────────────────────────────────

interface ChildCardProps {
  node: CallgraphNode;
  locale: AnalysisLocale;
  onFileClick: (path: string) => void;
  isAnalyzing: boolean;
  moduleColor?: string | null;
  isDimmed: boolean;
  isHighlighted: boolean;
}

function ChildCard({ node, locale, onFileClick, isAnalyzing, moduleColor, isDimmed, isHighlighted }: ChildCardProps) {
  const s = DRILL_STYLE[node.drillDown] ?? DRILL_STYLE[0];
  const label = DRILL_LABEL[locale][node.drillDown as -1 | 0 | 1];
  const filename = node.likelyFile
    ? (node.likelyFile.split("/").pop() ?? node.likelyFile)
    : TEXT[locale].noFile;
  const routePath = node.routePath?.trim() || null;
  const dimmed = node.drillDown === -1 || isDimmed;

  return (
    <div
      onClick={() => node.likelyFile && onFileClick(node.likelyFile)}
      title={[node.likelyFile, routePath].filter(Boolean).join("\n") || undefined}
      style={{
        position: "absolute",
        width: CARD_W,
        height: CARD_H,
        cursor: node.likelyFile ? "pointer" : "default",
        borderRadius: 8,
        overflow: "hidden",
        border: `1px solid ${moduleColor ?? s.border}`,
        background: s.bg,
        opacity: dimmed ? 0.55 : 1,
        boxShadow: isHighlighted
          ? `0 0 0 2px ${moduleColor ?? s.dot}, 0 2px 12px rgba(0,0,0,0.28)`
          : "0 2px 8px rgba(0,0,0,0.25)",
        transition: "opacity 0.15s, box-shadow 0.15s",
        filter: isDimmed ? "grayscale(1)" : "none",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "4px 8px",
          borderBottom: `1px solid ${moduleColor ? moduleColor + "55" : "var(--border)"}`,
          background: moduleColor ?? s.headerBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: moduleColor ? "#ffffffdd" : "var(--muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            fontFamily: "var(--font-geist-mono, monospace)",
          }}
        >
          {filename}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {isAnalyzing && (
            <Loader2
              size={10}
              className="animate-spin"
              style={{ color: "var(--accent)", flexShrink: 0 }}
            />
          )}
          {label && (
            <span
              style={{
                fontSize: 9,
                color: s.dot,
                border: `1px solid ${s.border}`,
                borderRadius: 999,
                padding: "0px 5px",
                background: "color-mix(in srgb, var(--hover) 50%, transparent)",
              }}
            >
              {label}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "6px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: s.dot,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: s.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-geist-mono, monospace)",
            }}
          >
            {node.name}
          </span>
        </div>
        {routePath && (
          <div
            style={{
              marginBottom: 4,
              paddingLeft: 11,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: "var(--muted)",
                border: "1px solid var(--border)",
                borderRadius: 999,
                padding: "0px 4px",
                flexShrink: 0,
              }}
            >
              {TEXT[locale].endpoint}
            </span>
            <span
              style={{
                fontSize: 10,
                color: "var(--accent)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-geist-mono, monospace)",
              }}
            >
              {routePath}
            </span>
          </div>
        )}
        <div
          style={{
            fontSize: 10,
            color: s.desc,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: routePath ? 2 : 3,
            WebkitBoxOrient: "vertical",
            lineHeight: "1.4",
            paddingLeft: 11,
          }}
        >
          {node.description}
        </div>
      </div>

    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface PanoramaPanelProps {
  loading: boolean;
  result: CallgraphResult | null;
  moduleAnalysis?: ModuleAnalysisResult | null;
  selectedModuleId?: string | null;
  locale: AnalysisLocale;
  descriptionLocale: AnalysisLocale;
  onDescriptionLocaleChange: (locale: AnalysisLocale) => void;
  onFileClick: (path: string) => void;
  onManualDrilldown: (path: number[]) => void;
  analyzingFunctions?: Set<string>;
  manualDrilldownPaths?: Set<string>;
  repoName?: string;
}

function PanoramaPanel({
  loading,
  result,
  moduleAnalysis,
  selectedModuleId,
  locale,
  descriptionLocale,
  onDescriptionLocaleChange,
  onFileClick,
  onManualDrilldown,
  analyzingFunctions,
  manualDrilldownPaths,
  repoName,
}: PanoramaPanelProps) {
  const t = TEXT[locale];
  const containerRef = useRef<HTMLDivElement>(null);
  const resultNodeCount = result ? countCallgraphNodes(result) : 0;
  const resultKey = result
    ? `${result.entryFile}::${result.rootFunction}::${resultNodeCount}`
    : "empty";

  const [tx, setTx] = useState(20);
  const [ty, setTy] = useState(20);
  const [scale, setScale] = useState(1);

  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const prevResultRef = useRef<CallgraphResult | null>(null);
  const [collapseState, setCollapseState] = useState<{ resultKey: string; paths: Set<string> }>({
    resultKey: "empty",
    paths: new Set(),
  });
  const collapsedPaths = useMemo(
    () => (collapseState.resultKey === resultKey ? collapseState.paths : new Set<string>()),
    [collapseState, resultKey],
  );

  const collapsiblePaths = useMemo(
    () => (result ? collectCollapsiblePaths(result) : []),
    [result],
  );

  const [downloading, setDownloading] = useState<"png" | "svg" | null>(null);

  const exportData = result
    ? { result, moduleAnalysis, locale: descriptionLocale, repoName }
    : null;

  const filenameBase = repoName
    ? `panocode-${repoName.replace(/\//g, "-")}`
    : "panocode-callgraph";

  const handleDownloadPng = async () => {
    if (!exportData) return;
    setDownloading("png");
    try { await downloadPanoramaAsPng(exportData, `${filenameBase}.png`); }
    finally { setDownloading(null); }
  };

  const handleDownloadSvg = () => {
    if (!exportData) return;
    setDownloading("svg");
    try { downloadPanoramaAsSvg(exportData, `${filenameBase}.svg`); }
    finally { setDownloading(null); }
  };

  const handleDownloadJson = () => {
    if (!result) return;
    downloadPanoramaAsJson(result, `${filenameBase}.json`);
  };

  // ── Reset/fit view ──────────────────────────────────────────────────────────

  const resetView = useCallback(() => {
    if (!containerRef.current || !result) {
      setTx(20);
      setTy(20);
      setScale(1);
      return;
    }
    const { canvasW, canvasH } = computeLayout(result, collapsedPaths);
    const { clientWidth, clientHeight } = containerRef.current;
    const z = Math.min(clientWidth / canvasW, clientHeight / canvasH, 1);
    setScale(z);
    setTx(Math.max(8, (clientWidth - canvasW * z) / 2));
    setTy(Math.max(8, (clientHeight - canvasH * z) / 2));
  }, [collapsedPaths, result]);

  // Only reset view when result transitions from null → non-null (first load)
  useEffect(() => {
    let frameId: number | null = null;
    if (result && !prevResultRef.current) {
      frameId = window.requestAnimationFrame(() => {
        resetView();
      });
    }
    prevResultRef.current = result;
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [result, resetView]);

  // ── Pan (global mouse move) ─────────────────────────────────────────────────

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, tx, ty };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setTx(dragStart.current.tx + e.clientX - dragStart.current.x);
      setTy(dragStart.current.ty + e.clientY - dragStart.current.y);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── Zoom (mouse wheel) ─────────────────────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const nextScale = Math.min(Math.max(scale * (e.deltaY < 0 ? 1.1 : 0.9), 0.1), 4);

    if (nextScale === scale) return;

    const worldX = (mouseX - tx) / scale;
    const worldY = (mouseY - ty) / scale;

    setScale(nextScale);
    setTx(mouseX - worldX * nextScale);
    setTy(mouseY - worldY * nextScale);
  }, [scale, tx, ty]);

  // ── Toolbar buttons ─────────────────────────────────────────────────────────

  const zoomIn = () => setScale((s) => Math.min(s * 1.2, 4));
  const zoomOut = () => setScale((s) => Math.max(s / 1.2, 0.1));

  const toggleCollapsed = useCallback((path: number[]) => {
    const key = serializeCallgraphPath(path);
    setCollapseState((prev) => {
      const basePaths = prev.resultKey === resultKey ? prev.paths : new Set<string>();
      const next = new Set(basePaths);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return { resultKey, paths: next };
    });
  }, [resultKey]);

  const collapseAll = useCallback(() => {
    setCollapseState({ resultKey, paths: new Set(collapsiblePaths) });
  }, [collapsiblePaths, resultKey]);

  const expandAll = useCallback(() => {
    setCollapseState({ resultKey, paths: new Set() });
  }, [resultKey]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const layout = useMemo(
    () => (result ? computeLayout(result, collapsedPaths) : null),
    [collapsedPaths, result],
  );
  const connGroups =
    layout && result ? computeConnectors(result, layout.nodes, layout.rootY, collapsedPaths) : [];

  const totalNodes = resultNodeCount;

  // ── Auto-pan to selected module's first node ─────────────────────────────
  const scaleRef = useRef(scale);
  useEffect(() => { scaleRef.current = scale; }, [scale]);

  const prevModuleId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (selectedModuleId === prevModuleId.current) return;
    prevModuleId.current = selectedModuleId;
    if (!selectedModuleId || !layout || !moduleAnalysis || !containerRef.current) return;
    const target = layout.nodes.find(
      (ln) => getFunctionModule(moduleAnalysis, ln.node.name)?.moduleId === selectedModuleId,
    );
    if (!target) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const s = scaleRef.current;
    setTx(clientWidth / 2 - (target.x + CARD_W / 2) * s);
    setTy(clientHeight / 2 - (target.y + CARD_H / 2) * s);
  }, [selectedModuleId, layout, moduleAnalysis]);

  const renderActionAnchor = (
    left: number,
    top: number,
    content: ReactNode,
    key: string,
  ) => (
    <div key={key} style={{ position: "absolute", left, top, width: 0, height: 0 }}>
      <div
        style={{
          position: "absolute",
          left: -0.5,
          top: 0,
          width: 1,
          height: ACTION_LINE_H,
          borderLeft: "1px dashed var(--border)",
        }}
      />
      <div style={{ position: "absolute", top: ACTION_LINE_H, left: 0, transform: "translateX(-50%)" }}>
        {content}
      </div>
    </div>
  );

  const renderToggleButton = (
    collapsed: boolean,
    label: string,
    childCount: number,
    hiddenCount: number,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void,
  ) => (
    <button
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onClick}
      title={`${collapsed ? t.expandNode : t.collapseNode} · ${childCount} ${label}${hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}`}
      className="group relative flex items-center justify-center rounded-full border transition-all hover:-translate-y-0.5"
      style={{
        width: 30,
        height: 30,
        borderColor: collapsed ? "var(--accent)" : "color-mix(in srgb, var(--accent) 35%, var(--border))",
        background: collapsed
          ? "color-mix(in srgb, var(--accent) 18%, var(--panel))"
          : "color-mix(in srgb, var(--accent) 82%, var(--panel))",
        color: collapsed ? "var(--accent)" : "var(--accent-contrast)",
        boxShadow: collapsed
          ? "0 3px 12px rgba(0,0,0,0.18)"
          : "0 4px 14px color-mix(in srgb, var(--accent) 25%, transparent)",
      }}
    >
      {collapsed ? <Plus size={14} /> : <Minus size={14} />}
      <span
        style={{
          position: "absolute",
          right: -5,
          bottom: -5,
          minWidth: 17,
          height: 17,
          padding: "0 4px",
          borderRadius: 999,
          border: "1px solid var(--panel)",
          background: "var(--text)",
          color: "var(--bg)",
          fontSize: 9,
          fontWeight: 700,
          lineHeight: "15px",
          textAlign: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
        }}
      >
        {childCount}
      </span>
    </button>
  );

  // ── Drilldown anchor: button to the RIGHT of a leaf card ────────────────────

  const renderDrilldownAnchor = (
    cardRightX: number,
    cardCenterY: number,
    isLoading: boolean,
    onClick: () => void,
    key: string,
  ) => (
    <div
      key={key}
      style={{
        position: "absolute",
        left: cardRightX + 4,
        top: cardCenterY - DRILL_BTN_R,
        display: "flex",
        alignItems: "center",
        pointerEvents: "none",
      }}
    >
      {/* Short animated dashed line connecting card to button */}
      <svg
        width={DRILL_LINE_W}
        height={DRILL_BTN_R * 2}
        style={{ overflow: "visible", flexShrink: 0 }}
      >
        <line
          x1={0} y1={DRILL_BTN_R} x2={DRILL_LINE_W} y2={DRILL_BTN_R}
          stroke="var(--accent)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          style={{ animation: "drillFlow 0.7s linear infinite" }}
        />
      </svg>
      {/* Circular drill-down button */}
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        disabled={isLoading}
        title={t.continueDrilldown}
        className="group transition-all hover:scale-110 active:scale-95 disabled:cursor-wait"
        style={{
          width: DRILL_BTN_R * 2,
          height: DRILL_BTN_R * 2,
          borderRadius: "50%",
          border: "1.5px solid var(--accent)",
          background: "color-mix(in srgb, var(--accent) 16%, var(--panel))",
          color: "var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          pointerEvents: "auto",
          boxShadow: "0 2px 10px color-mix(in srgb, var(--accent) 30%, transparent)",
        }}
      >
        {isLoading
          ? <Loader2 size={11} className="animate-spin" />
          : <Sparkles size={11} className="group-hover:rotate-12 transition-transform" />
        }
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--panel)" }}
      >
        <div className="flex items-center gap-1.5">
          <Network size={12} style={{ color: "var(--accent)" }} />
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--muted)" }}
          >
            {t.title}
          </span>
          {result && (
            <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
              ({totalNodes})
            </span>
          )}
          {analyzingFunctions && analyzingFunctions.size > 0 && (
            <Loader2
              size={10}
              className="animate-spin"
              style={{ color: "var(--accent)" }}
            />
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <div className="mr-2 flex items-center gap-1 rounded-md border px-1 py-1" style={{ borderColor: "var(--border)" }}>
            <span className="px-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {t.descriptionLanguage}
            </span>
            {(["zh", "en"] as const).map((value) => {
              const active = value === descriptionLocale;
              return (
                <button
                  key={value}
                  onClick={() => onDescriptionLocaleChange(value)}
                  className="rounded px-2 py-0.5 text-[11px] transition-colors"
                  style={{
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "var(--accent-contrast)" : "var(--muted)",
                  }}
                >
                  {value === "zh" ? t.localeZh : t.localeEn}
                </button>
              );
            })}
          </div>
          <button
            onClick={expandAll}
            className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors hover:bg-[var(--hover)]"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            title={t.expandAll}
          >
            <ChevronDown size={12} />
            {t.expandAll}
          </button>
          <button
            onClick={collapseAll}
            className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors hover:bg-[var(--hover)]"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            title={t.collapseAll}
          >
            <ChevronUp size={12} />
            {t.collapseAll}
          </button>
          <button
            onClick={zoomOut}
            className="p-1 rounded hover:bg-[var(--hover)] transition-colors"
            title={t.zoomOut}
          >
            <ZoomOut size={11} style={{ color: "var(--muted)" }} />
          </button>
          <button
            onClick={zoomIn}
            className="p-1 rounded hover:bg-[var(--hover)] transition-colors"
            title={t.zoomIn}
          >
            <ZoomIn size={11} style={{ color: "var(--muted)" }} />
          </button>
          <button
            onClick={resetView}
            className="p-1 rounded hover:bg-[var(--hover)] transition-colors"
            title={t.reset}
          >
            <RefreshCcw size={11} style={{ color: "var(--muted)" }} />
          </button>

          {/* Download buttons — only shown when there's data */}
          {result && (
            <>
              <div style={{ width: 1, height: 12, background: "var(--border)", margin: "0 2px" }} />
              <button
                onClick={handleDownloadPng}
                disabled={!!downloading}
                className="p-1 rounded hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
                title={t.downloadPng}
              >
                {downloading === "png"
                  ? <Loader2 size={11} className="animate-spin" style={{ color: "var(--accent)" }} />
                  : <Image size={11} style={{ color: "var(--muted)" }} />
                }
              </button>
              <button
                onClick={handleDownloadSvg}
                disabled={!!downloading}
                className="p-1 rounded hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
                title={t.downloadSvg}
              >
                {downloading === "svg"
                  ? <Loader2 size={11} className="animate-spin" style={{ color: "var(--accent)" }} />
                  : <Download size={11} style={{ color: "var(--muted)" }} />
                }
              </button>
              <button
                onClick={handleDownloadJson}
                disabled={!!downloading}
                className="p-1 rounded hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
                title={t.downloadJson}
              >
                <FileJson size={11} style={{ color: "var(--muted)" }} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden" style={{ background: "var(--bg)" }}>
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin" style={{ color: "var(--accent)" }} />
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {t.loading}
            </span>
          </div>
        )}

        {!loading && !result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
            <Network size={28} style={{ color: "var(--border)" }} />
            <span className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              {t.empty}
            </span>
          </div>
        )}

        {result && !loading && layout && (
          <div
            ref={containerRef}
            className="absolute inset-0"
            style={{ cursor: "grab" }}
            onMouseDown={onMouseDown}
            onWheel={onWheel}
          >
            <div
              style={{
                position: "absolute",
                transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                transformOrigin: "0 0",
                width: layout.canvasW,
                height: layout.canvasH,
              }}
            >
              {/* SVG connector lines (rendered below cards) */}
              <Connectors
                groups={connGroups}
                canvasW={layout.canvasW}
                canvasH={layout.canvasH}
              />

              {/* Root card */}
              <div
                style={{
                  position: "absolute",
                  left: layout.rootX,
                  top: layout.rootY,
                }}
              >
                <RootCard
                  name={result.rootFunction}
                  file={result.entryFile}
                  onClick={() => onFileClick(result.entryFile)}
                  moduleColor={getFunctionModule(moduleAnalysis, result.rootFunction)?.color}
                  isDimmed={selectedModuleId !== null && getFunctionModule(moduleAnalysis, result.rootFunction)?.moduleId !== selectedModuleId}
                  isHighlighted={selectedModuleId !== null && getFunctionModule(moduleAnalysis, result.rootFunction)?.moduleId === selectedModuleId}
                />
              </div>

              {result.children.length > 0 && renderActionAnchor(
                layout.rootX + ROOT_W / 2,
                layout.rootY + ROOT_H + ACTION_OFFSET_Y,
                renderToggleButton(
                  collapsedPaths.has("root"),
                  t.rootChildrenCount,
                  result.children.length,
                  collapsedPaths.has("root") ? result.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0) : 0,
                  (event) => {
                    event.stopPropagation();
                    toggleCollapsed([]);
                  },
                ),
                "root-action",
              )}

              {/* Child cards */}
              {layout.nodes.map((ln) => {
                const pathKey = serializeCallgraphPath(ln.path);
                const nodeHasChildren = hasChildren(ln.node);
                const nodeCollapsed = collapsedPaths.has(pathKey);
                const isManualLoading = manualDrilldownPaths?.has(pathKey) ?? false;
                const childCount = ln.node.children?.length ?? 0;
                const hiddenCount = nodeHasChildren ? countHiddenNodes(ln.node, nodeCollapsed) : 0;

                return (
                  <div key={`${pathKey}-${ln.node.name}`}>
                    <div style={{ position: "absolute", left: ln.x, top: ln.y }}>
                      <ChildCard
                        node={ln.node}
                        locale={locale}
                        onFileClick={onFileClick}
                        isAnalyzing={analyzingFunctions?.has(ln.node.name) ?? false}
                        moduleColor={getFunctionModule(moduleAnalysis, ln.node.name)?.color}
                        isDimmed={selectedModuleId !== null && getFunctionModule(moduleAnalysis, ln.node.name)?.moduleId !== selectedModuleId}
                        isHighlighted={selectedModuleId !== null && getFunctionModule(moduleAnalysis, ln.node.name)?.moduleId === selectedModuleId}
                      />
                    </div>

                    {!nodeHasChildren && shouldShowContinueDrilldown(ln.node) && renderDrilldownAnchor(
                      ln.x + CARD_W,
                      ln.y + CARD_H / 2,
                      isManualLoading,
                      () => onManualDrilldown(ln.path),
                      `${pathKey}-drilldown`,
                    )}

                    {nodeHasChildren && renderActionAnchor(
                      ln.x + CARD_W / 2,
                      ln.y + CARD_H + ACTION_OFFSET_Y,
                      renderToggleButton(
                        nodeCollapsed,
                        t.childrenCount,
                        childCount,
                        hiddenCount,
                        (event) => {
                          event.stopPropagation();
                          toggleCollapsed(ln.path);
                        },
                      ),
                      `${pathKey}-toggle`,
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(PanoramaPanel);
