"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Network, RefreshCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { CallgraphResult, CallgraphNode } from "@/app/api/analyze/callgraph/route";
import type { AnalysisLocale } from "@/components/AnalysisPanel";
import { getFunctionModule, type ModuleAnalysisResult } from "@/lib/moduleAnalysis";

// ── Layout constants ──────────────────────────────────────────────────────────

const ROOT_W = 260;
const ROOT_H = 90;
const CARD_W = 220;
const CARD_H = 86;
const COL_GAP = 64;         // horizontal gap between parent-right and child-left
const CARD_GAP = 12;        // vertical gap between sibling cards
const CONN_MARGIN = 20;     // connector vertical line is this far left of child column
const CANVAS_PAD_X = 20;
const CANVAS_PAD_Y = 20;

// ── drillDown visuals ─────────────────────────────────────────────────────────

const DRILL_STYLE: Record<number, { dot: string; bg: string; border: string }> = {
  1:  { dot: "#3fb950", bg: "#1a3a2e", border: "#22c55e44" },
  0:  { dot: "#60a5fa", bg: "var(--panel)", border: "var(--border)" },
  [-1]: { dot: "#4b5563", bg: "var(--panel)", border: "var(--border)" },
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
    descriptionLanguage: "函数介绍",
    localeZh: "中文",
    localeEn: "English",
  },
  en: {
    title:   "Panorama",
    loading: "Analyzing call graph…",
    empty:   "Auto-runs after entry confirmed",
    reset:   "Reset view",
    zoomIn:  "Zoom in",
    zoomOut: "Zoom out",
    noFile:  "—",
    descriptionLanguage: "Descriptions",
    localeZh: "中文",
    localeEn: "English",
  },
} as const;

// ── Tree layout ───────────────────────────────────────────────────────────────

interface LayoutNode {
  node: CallgraphNode;
  x: number;
  y: number;
  depth: number;
  parentPath: number[];   // path indices from result.children
  selfIndex: number;      // index within parent's children
}

/** Height of node's full subtree (including descendants). */
function subtreeH(node: CallgraphNode): number {
  const ch = node.children ?? [];
  if (ch.length === 0) return CARD_H;
  const total = ch.reduce((s, c) => s + subtreeH(c), 0);
  return Math.max(CARD_H, total + (ch.length - 1) * CARD_GAP);
}

/** X position of the left edge of cards at a given depth. */
function colX(depth: number): number {
  return CANVAS_PAD_X + ROOT_W + COL_GAP + depth * (CARD_W + COL_GAP);
}

function computeLayout(result: CallgraphResult): {
  nodes: LayoutNode[];
  rootX: number;
  rootY: number;
  canvasW: number;
  canvasH: number;
} {
  const nodes: LayoutNode[] = [];

  // Total height is driven by depth-0 children
  const childrenTotalH =
    result.children.length === 0
      ? 0
      : result.children.reduce((s, c) => s + subtreeH(c), 0) +
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
      const h = subtreeH(child);
      const cardY = cursor + (h - CARD_H) / 2;
      nodes.push({ node: child, x: colX(depth), y: cardY, depth, parentPath, selfIndex: i });
      if (child.children && child.children.length > 0) {
        layout(child.children, depth + 1, cursor, [...parentPath, i]);
      }
      cursor += h + CARD_GAP;
    }
  }

  if (result.children.length > 0) {
    layout(result.children, 0, childrenStartY, []);
  }

  const maxDepth = nodes.length > 0 ? Math.max(...nodes.map((n) => n.depth)) : -1;
  const canvasW =
    CANVAS_PAD_X * 2 +
    ROOT_W +
    (maxDepth >= 0 ? COL_GAP + (maxDepth + 1) * (CARD_W + COL_GAP) : 0);
  const canvasH = CANVAS_PAD_Y * 2 + mainH;

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
): ConnGroup[] {
  const groups: ConnGroup[] = [];

  // Root → depth-0 children
  if (result.children.length > 0) {
    const d0 = layoutNodes.filter((n) => n.depth === 0 && n.parentPath.length === 0);
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
    if (!ln.node.children || ln.node.children.length === 0) continue;
    const childDepth = ln.depth + 1;
    const myPath = [...ln.parentPath, ln.selfIndex];
    const myChildren = layoutNodes.filter(
      (n) =>
        n.depth === childDepth &&
        n.parentPath.length === myPath.length &&
        n.parentPath.every((v, i) => v === myPath[i]),
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
        return (
          <g key={gi} stroke="var(--border)" strokeWidth={1.5} strokeDasharray="5 4" fill="none">
            {/* Horizontal elbow from parent right to connector X */}
            <line x1={g.parentRightX} y1={g.parentCenterY} x2={g.connX} y2={g.parentCenterY} />
            {/* Vertical connector line */}
            <line x1={g.connX} y1={minY} x2={g.connX} y2={maxY} />
            {/* Horizontal lines to each child */}
            {g.childCenterYs.map((cy, i) => (
              <line key={i} x1={g.connX} y1={cy} x2={g.childLeftX} y2={cy} />
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
        border: `1px solid ${moduleColor ?? "#22c55e55"}`,
        background: "#0f2a1a",
        boxShadow: isHighlighted
          ? `0 0 0 2px ${moduleColor ?? "#22c55e"}, 0 4px 16px rgba(0,0,0,0.3)`
          : "0 4px 16px rgba(0,0,0,0.3)",
        opacity: isDimmed ? 0.22 : 1,
        filter: isDimmed ? "grayscale(1)" : "none",
      }}
    >
      <div
        style={{
          padding: "5px 10px",
          borderBottom: `1px solid ${moduleColor ?? "#22c55e33"}`,
          background: moduleColor ?? "#0a1f13",
          fontSize: 10,
          color: "#ffffff",
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
            color: "#3fb950",
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
            color: "#3fb950aa",
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
  const dimmed = node.drillDown === -1 || isDimmed;

  return (
    <div
      onClick={() => node.likelyFile && onFileClick(node.likelyFile)}
      title={node.likelyFile ?? undefined}
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
          borderBottom: "1px solid var(--border)",
          background: moduleColor ?? "color-mix(in srgb, var(--hover) 60%, transparent)",
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
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-geist-mono, monospace)",
            }}
          >
            {node.name}
          </span>
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--muted)",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
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
  analyzingFunctions?: Set<string>;
}

export default function PanoramaPanel({
  loading,
  result,
  moduleAnalysis,
  selectedModuleId,
  locale,
  descriptionLocale,
  onDescriptionLocaleChange,
  onFileClick,
  analyzingFunctions,
}: PanoramaPanelProps) {
  const t = TEXT[locale];
  const containerRef = useRef<HTMLDivElement>(null);

  const [tx, setTx] = useState(20);
  const [ty, setTy] = useState(20);
  const [scale, setScale] = useState(1);

  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const prevResultRef = useRef<CallgraphResult | null>(null);

  // ── Reset/fit view ──────────────────────────────────────────────────────────

  const resetView = useCallback(() => {
    if (!containerRef.current || !result) {
      setTx(20);
      setTy(20);
      setScale(1);
      return;
    }
    const { canvasW, canvasH } = computeLayout(result);
    const { clientWidth, clientHeight } = containerRef.current;
    const z = Math.min(clientWidth / canvasW, clientHeight / canvasH, 1);
    setScale(z);
    setTx(Math.max(8, (clientWidth - canvasW * z) / 2));
    setTy(Math.max(8, (clientHeight - canvasH * z) / 2));
  }, [result]);

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

  // ── Render ──────────────────────────────────────────────────────────────────

  const layout = result ? computeLayout(result) : null;
  const connGroups =
    layout && result ? computeConnectors(result, layout.nodes, layout.rootY) : [];

  const totalNodes = layout ? layout.nodes.length : 0;

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

              {/* Child cards */}
              {layout.nodes.map((ln) => (
                <div
                  key={`${ln.parentPath.join("-")}-${ln.selfIndex}-${ln.node.name}`}
                  style={{ position: "absolute", left: ln.x, top: ln.y }}
                >
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
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
