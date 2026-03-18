"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Network, RefreshCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { CallgraphResult, CallgraphNode } from "@/app/api/analyze/callgraph/route";
import type { AnalysisLocale } from "@/components/AnalysisPanel";

// ── Layout constants ──────────────────────────────────────────────────────────

const ROOT_W = 260;
const ROOT_H = 90;
const CHILD_W = 240;
const CHILD_H = 86;
const CONNECTOR_X = 32;   // x of the vertical dashed line (relative to canvas origin)
const CHILD_X = 96;       // left edge of child cards
const CHILD_Y_START = ROOT_H + 48;
const CHILD_GAP = 12;
const CANVAS_PAD_X = 20;
const CANVAS_PAD_Y = 20;

function childTop(i: number) {
  return CANVAS_PAD_Y + CHILD_Y_START + i * (CHILD_H + CHILD_GAP);
}

function childCenterY(i: number) {
  return childTop(i) + CHILD_H / 2;
}

function canvasWidth() {
  return CANVAS_PAD_X * 2 + Math.max(ROOT_W, CHILD_X + CHILD_W);
}

function canvasHeight(n: number) {
  if (n === 0) return CANVAS_PAD_Y * 2 + ROOT_H;
  return CANVAS_PAD_Y + CHILD_Y_START + n * (CHILD_H + CHILD_GAP) - CHILD_GAP + CANVAS_PAD_Y;
}

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
  },
  en: {
    title:   "Panorama",
    loading: "Analyzing call graph…",
    empty:   "Auto-runs after entry confirmed",
    reset:   "Reset view",
    zoomIn:  "Zoom in",
    zoomOut: "Zoom out",
    noFile:  "—",
  },
} as const;

// ── Root node card ────────────────────────────────────────────────────────────

interface RootCardProps {
  name: string;
  file: string;
  onClick: () => void;
}

function RootCard({ name, file, onClick }: RootCardProps) {
  const filename = file.split("/").pop() ?? file;
  return (
    <div
      onClick={onClick}
      style={{
        position: "absolute",
        left: CANVAS_PAD_X,
        top: CANVAS_PAD_Y,
        width: ROOT_W,
        height: ROOT_H,
        cursor: "pointer",
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid #22c55e55",
        background: "#0f2a1a",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
      }}
    >
      <div
        style={{
          padding: "5px 10px",
          borderBottom: "1px solid #22c55e33",
          background: "#0a1f13",
          fontSize: 10,
          color: "#3fb950",
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
        <div style={{ fontSize: 10, color: "#3fb950aa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {file}
        </div>
      </div>
    </div>
  );
}

// ── Child node card ───────────────────────────────────────────────────────────

interface ChildCardProps {
  node: CallgraphNode;
  index: number;
  locale: AnalysisLocale;
  onFileClick: (path: string) => void;
}

function ChildCard({ node, index, locale, onFileClick }: ChildCardProps) {
  const s = DRILL_STYLE[node.drillDown] ?? DRILL_STYLE[0];
  const label = DRILL_LABEL[locale][node.drillDown as -1 | 0 | 1];
  const filename = node.likelyFile ? node.likelyFile.split("/").pop() ?? node.likelyFile : TEXT[locale].noFile;
  const dimmed = node.drillDown === -1;

  return (
    <div
      onClick={() => node.likelyFile && onFileClick(node.likelyFile)}
      title={node.likelyFile ?? undefined}
      style={{
        position: "absolute",
        left: CANVAS_PAD_X + CHILD_X,
        top: childTop(index),
        width: CHILD_W,
        height: CHILD_H,
        cursor: node.likelyFile ? "pointer" : "default",
        borderRadius: 8,
        overflow: "hidden",
        border: `1px solid ${s.border}`,
        background: s.bg,
        opacity: dimmed ? 0.55 : 1,
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        transition: "opacity 0.15s",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "4px 8px",
          borderBottom: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--hover) 60%, transparent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "var(--muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            fontFamily: "var(--font-geist-mono, monospace)",
          }}
        >
          {filename}
        </span>
        {label && (
          <span
            style={{
              fontSize: 9,
              color: s.dot,
              flexShrink: 0,
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

// ── Connector SVG ─────────────────────────────────────────────────────────────

function Connectors({ count }: { count: number }) {
  if (count === 0) return null;

  const absConnX = CANVAS_PAD_X + CONNECTOR_X;
  const lineStart = CANVAS_PAD_Y + ROOT_H;
  const lastCY = childCenterY(count - 1);

  return (
    <svg
      style={{ position: "absolute", top: 0, left: 0, overflow: "visible", pointerEvents: "none" }}
      width={canvasWidth()}
      height={canvasHeight(count)}
    >
      {/* Vertical dashed line */}
      <line
        x1={absConnX} y1={lineStart}
        x2={absConnX} y2={lastCY}
        stroke="var(--border)"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
      {/* Horizontal dashes to each child */}
      {Array.from({ length: count }, (_, i) => {
        const cy = childCenterY(i);
        return (
          <line
            key={i}
            x1={absConnX} y1={cy}
            x2={CANVAS_PAD_X + CHILD_X} y2={cy}
            stroke="var(--border)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
        );
      })}
    </svg>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface PanoramaPanelProps {
  loading: boolean;
  result: CallgraphResult | null;
  locale: AnalysisLocale;
  onFileClick: (path: string) => void;
}

export default function PanoramaPanel({ loading, result, locale, onFileClick }: PanoramaPanelProps) {
  const t = TEXT[locale];
  const containerRef = useRef<HTMLDivElement>(null);

  const [tx, setTx] = useState(20);
  const [ty, setTy] = useState(20);
  const [scale, setScale] = useState(1);

  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // ── Reset/fit view ──────────────────────────────────────────────────────────

  const resetView = useCallback(() => {
    if (!containerRef.current || !result) {
      setTx(20); setTy(20); setScale(1);
      return;
    }
    const { clientWidth, clientHeight } = containerRef.current;
    const cw = canvasWidth();
    const ch = canvasHeight(result.children.length);
    const z = Math.min(clientWidth / cw, clientHeight / ch, 1);
    setScale(z);
    setTx(Math.max(8, (clientWidth  - cw * z) / 2));
    setTy(Math.max(8, (clientHeight - ch * z) / 2));
  }, [result]);

  useEffect(() => { resetView(); }, [resetView]);

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

  // ── Zoom (passive:false wheel) ──────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setScale((prev) => Math.min(Math.max(prev * (e.deltaY < 0 ? 1.1 : 0.9), 0.15), 3));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // ── Toolbar buttons ─────────────────────────────────────────────────────────

  const zoomIn  = () => setScale((s) => Math.min(s * 1.2, 3));
  const zoomOut = () => setScale((s) => Math.max(s / 1.2, 0.15));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--panel)" }}
      >
        <div className="flex items-center gap-1.5">
          <Network size={12} style={{ color: "var(--accent)" }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            {t.title}
          </span>
          {result && (
            <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
              ({result.children.length})
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={zoomOut} className="p-1 rounded hover:bg-[var(--hover)] transition-colors" title={t.zoomOut}>
            <ZoomOut size={11} style={{ color: "var(--muted)" }} />
          </button>
          <button onClick={zoomIn} className="p-1 rounded hover:bg-[var(--hover)] transition-colors" title={t.zoomIn}>
            <ZoomIn size={11} style={{ color: "var(--muted)" }} />
          </button>
          <button onClick={resetView} className="p-1 rounded hover:bg-[var(--hover)] transition-colors" title={t.reset}>
            <RefreshCcw size={11} style={{ color: "var(--muted)" }} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden" style={{ background: "var(--bg)" }}>

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin" style={{ color: "var(--accent)" }} />
            <span className="text-xs" style={{ color: "var(--muted)" }}>{t.loading}</span>
          </div>
        )}

        {!loading && !result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
            <Network size={28} style={{ color: "var(--border)" }} />
            <span className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>{t.empty}</span>
          </div>
        )}

        {result && !loading && (
          <div
            ref={containerRef}
            className="absolute inset-0"
            style={{ cursor: "grab" }}
            onMouseDown={onMouseDown}
          >
            <div
              style={{
                position: "absolute",
                transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                transformOrigin: "0 0",
                width: canvasWidth(),
                height: canvasHeight(result.children.length),
              }}
            >
              {/* SVG connector lines (rendered below cards) */}
              <Connectors count={result.children.length} />

              {/* Root card */}
              <RootCard
                name={result.rootFunction}
                file={result.entryFile}
                onClick={() => onFileClick(result.entryFile)}
              />

              {/* Child cards */}
              {result.children.map((node, i) => (
                <ChildCard
                  key={`${node.name}-${i}`}
                  node={node}
                  index={i}
                  locale={locale}
                  onFileClick={onFileClick}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
