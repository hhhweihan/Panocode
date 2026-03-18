"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Info,
  AlertTriangle,
  ScrollText,
  Grip,
} from "lucide-react";
import { type LogEntry, truncateJsonForDisplay } from "@/lib/logger";
import type { AnalysisLocale } from "@/components/AnalysisPanel";

const TEXT = {
  zh: {
    title: "工作日志",
    empty: "暂无日志",
    request: "请求",
    response: "响应",
    dock: "停靠",
    float: "浮窗",
    dockTitle: "停靠到侧边栏",
    floatTitle: "切换为浮窗",
    toggleOpen: "展开或收起日志",
    resize: "拖拽调整大小",
  },
  en: {
    title: "Activity Log",
    empty: "No logs yet",
    request: "Request",
    response: "Response",
    dock: "Dock",
    float: "Float",
    dockTitle: "Dock to sidebar",
    floatTitle: "Switch to floating window",
    toggleOpen: "Expand or collapse logs",
    resize: "Drag to resize",
  },
} as const;

const FLOATING_MIN_WIDTH = 280;
const FLOATING_MIN_HEIGHT = 180;
const FLOATING_DEFAULT_WIDTH = 380;
const FLOATING_DEFAULT_HEIGHT = 320;
const FLOATING_MARGIN = 16;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getDefaultFloatingRect() {
  if (typeof window === "undefined") {
    return {
      x: 0,
      y: 0,
      width: FLOATING_DEFAULT_WIDTH,
      height: FLOATING_DEFAULT_HEIGHT,
    };
  }

  const maxWidth = Math.max(FLOATING_MIN_WIDTH, window.innerWidth - FLOATING_MARGIN * 2);
  const maxHeight = Math.max(FLOATING_MIN_HEIGHT, window.innerHeight - FLOATING_MARGIN * 2);
  const saved = window.localStorage.getItem("panocode-log-floating-rect");

  if (saved) {
    try {
      const parsed = JSON.parse(saved) as { x: number; y: number; width: number; height: number };
      const width = clamp(parsed.width, FLOATING_MIN_WIDTH, maxWidth);
      const height = clamp(parsed.height, FLOATING_MIN_HEIGHT, maxHeight);
      const x = clamp(parsed.x, FLOATING_MARGIN, window.innerWidth - width - FLOATING_MARGIN);
      const y = clamp(parsed.y, FLOATING_MARGIN, window.innerHeight - height - FLOATING_MARGIN);

      return { x, y, width, height };
    } catch {
    }
  }

  return {
    x: window.innerWidth - FLOATING_DEFAULT_WIDTH - FLOATING_MARGIN,
    y: window.innerHeight - FLOATING_DEFAULT_HEIGHT - FLOATING_MARGIN,
    width: FLOATING_DEFAULT_WIDTH,
    height: FLOATING_DEFAULT_HEIGHT,
  };
}

/* ── per-entry level styles ─────────────────────────────── */
const LEVEL = {
  success: { icon: CheckCircle2, color: "var(--success)" },
  error:   { icon: XCircle,      color: "var(--error)"   },
  warning: { icon: AlertTriangle, color: "#f59e0b"       },
  info:    { icon: Info,          color: "var(--muted)"  },
} as const;

/* ── JSON block ─────────────────────────────────────────── */
function JsonBlock({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);
  const pretty = JSON.stringify(truncateJsonForDisplay(data), null, 2);

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs transition-colors"
        style={{ color: open ? "var(--accent)" : "var(--muted)" }}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {label}
      </button>
      {open && (
        <pre
          className="mt-1 p-2 rounded text-xs overflow-auto leading-relaxed"
          style={{
            background: "var(--debug-bg)",
            border: "1px solid var(--border)",
            color: "var(--debug-text)",
            fontFamily: "var(--font-geist-mono), monospace",
            maxHeight: "240px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {pretty}
        </pre>
      )}
    </div>
  );
}

/* ── single log entry ───────────────────────────────────── */
function EntryRow({ entry, locale }: { entry: LogEntry; locale: AnalysisLocale }) {
  const { icon: Icon, color } = LEVEL[entry.level];
  const hasJson = entry.json?.request !== undefined || entry.json?.response !== undefined;
  const text = TEXT[locale];

  return (
    <div className="px-3 py-1.5 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-start gap-1.5">
        <Icon size={12} className="shrink-0 mt-0.5" style={{ color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xs leading-tight flex-1" style={{ color: "var(--text)" }}>
              {entry.message}
            </span>
            <span className="text-xs shrink-0 tabular-nums" style={{ color: "var(--muted)" }}>
              {entry.time}
            </span>
          </div>
          {hasJson && (
            <div className="mt-0.5">
              {entry.json?.request !== undefined && (
                <JsonBlock label={text.request} data={entry.json.request} />
              )}
              {entry.json?.response !== undefined && (
                <JsonBlock label={text.response} data={entry.json.response} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── panel ──────────────────────────────────────────────── */
interface LogPanelProps {
  entries: LogEntry[];
  locale: AnalysisLocale;
  mode: "docked" | "floating";
  onModeChange: (mode: "docked" | "floating") => void;
  workflowStatus?: {
    state: "idle" | "working" | "completed" | "error";
    label: string;
  };
}

export default function LogPanel({ entries, locale, mode, onModeChange, workflowStatus }: LogPanelProps) {
  const [open, setOpen] = useState(true);
  const text = TEXT[locale];

  const isFloating = mode === "floating";

  const [floatingRect, setFloatingRect] = useState(getDefaultFloatingRect);
  const interactionRef = useRef<
    | {
        type: "drag";
        pointerOffsetX: number;
        pointerOffsetY: number;
      }
    | {
        type: "resize";
        startX: number;
        startY: number;
        startWidth: number;
        startHeight: number;
      }
    | null
  >(null);

  useEffect(() => {
    window.localStorage.setItem("panocode-log-floating-rect", JSON.stringify(floatingRect));
  }, [floatingRect]);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      if (interaction.type === "drag") {
        setFloatingRect((prev) => ({
          ...prev,
          x: clamp(event.clientX - interaction.pointerOffsetX, FLOATING_MARGIN, window.innerWidth - prev.width - FLOATING_MARGIN),
          y: clamp(event.clientY - interaction.pointerOffsetY, FLOATING_MARGIN, window.innerHeight - prev.height - FLOATING_MARGIN),
        }));
      }

      if (interaction.type === "resize") {
        setFloatingRect((prev) => {
          const width = clamp(
            interaction.startWidth + (event.clientX - interaction.startX),
            FLOATING_MIN_WIDTH,
            window.innerWidth - prev.x - FLOATING_MARGIN
          );
          const height = clamp(
            interaction.startHeight + (event.clientY - interaction.startY),
            FLOATING_MIN_HEIGHT,
            window.innerHeight - prev.y - FLOATING_MARGIN
          );

          return { ...prev, width, height };
        });
      }
    };

    const handlePointerUp = () => {
      interactionRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, []);

  const startDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isFloating) return;

    interactionRef.current = {
      type: "drag",
      pointerOffsetX: event.clientX - floatingRect.x,
      pointerOffsetY: event.clientY - floatingRect.y,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  };

  const startResize = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    interactionRef.current = {
      type: "resize",
      startX: event.clientX,
      startY: event.clientY,
      startWidth: floatingRect.width,
      startHeight: floatingRect.height,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
  };

  const rootStyle = isFloating
    ? {
        position: "fixed" as const,
        left: `${floatingRect.x}px`,
        top: `${floatingRect.y}px`,
        width: `${floatingRect.width}px`,
        height: open ? `${floatingRect.height}px` : "auto",
        minWidth: `${FLOATING_MIN_WIDTH}px`,
        minHeight: open ? `${FLOATING_MIN_HEIGHT}px` : "auto",
        overflow: "hidden",
        zIndex: 40,
        border: "1px solid var(--border)",
        borderRadius: "16px",
        background: "color-mix(in srgb, var(--panel) 92%, transparent)",
        boxShadow: "0 22px 48px rgba(0, 0, 0, 0.38)",
        backdropFilter: "blur(10px)",
      }
    : {
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      };

  return (
    <div style={rootStyle}>
      {/* Header */}
      <div
        onMouseDown={startDrag}
        className="flex items-center justify-between w-full px-3 py-2 hover:bg-[var(--hover)] transition-colors"
        style={{ cursor: isFloating ? "grab" : "default" }}
      >
        <div className="flex items-center gap-1.5">
          <ScrollText size={12} style={{ color: "var(--muted)" }} />
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            {text.title}
          </span>
          {workflowStatus && (
            <span
              className="text-[10px] px-1.5 py-0 rounded-full"
              style={{
                background:
                  workflowStatus.state === "working"
                    ? "#1d4ed833"
                    : workflowStatus.state === "completed"
                      ? "#16653433"
                      : workflowStatus.state === "error"
                        ? "#991b1b33"
                        : "var(--hover)",
                color:
                  workflowStatus.state === "working"
                    ? "#93c5fd"
                    : workflowStatus.state === "completed"
                      ? "#86efac"
                      : workflowStatus.state === "error"
                        ? "#fca5a5"
                        : "var(--muted)",
              }}
            >
              {workflowStatus.label}
            </span>
          )}
          {entries.length > 0 && (
            <span
              className="text-xs px-1.5 py-0 rounded-full"
              style={{ background: "var(--hover)", color: "var(--muted)" }}
            >
              {entries.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onModeChange(isFloating ? "docked" : "floating");
            }}
            className="rounded px-2 py-0.5 text-[11px] transition-colors hover:bg-[var(--hover)]"
            style={{ color: "var(--muted)" }}
            title={isFloating ? text.dockTitle : text.floatTitle}
          >
            {isFloating ? text.dock : text.float}
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              setOpen((value) => !value);
            }}
            className="rounded p-1 transition-colors hover:bg-[var(--hover)]"
            title={text.toggleOpen}
          >
            {open
              ? <ChevronDown size={12} style={{ color: "var(--muted)" }} />
              : <ChevronRight size={12} style={{ color: "var(--muted)" }} />
            }
          </button>
        </div>
      </div>

      {/* Entries */}
      {open && (
        <div
          className="overflow-y-auto"
          style={{
            maxHeight: isFloating ? "calc(100% - 41px)" : "220px",
            height: isFloating ? "calc(100% - 41px)" : "auto",
          }}
        >
          {entries.length === 0 ? (
            <p className="px-3 py-3 text-xs" style={{ color: "var(--muted)" }}>
              {text.empty}
            </p>
          ) : (
            entries.map((e) => <EntryRow key={e.id} entry={e} locale={locale} />)
          )}
        </div>
      )}

      {isFloating && open && (
        <button
          onMouseDown={startResize}
          className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--hover)]"
          title={text.resize}
        >
          <Grip size={12} style={{ color: "var(--muted)" }} />
        </button>
      )}
    </div>
  );
}
