"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Info,
  AlertTriangle,
  ScrollText,
} from "lucide-react";
import { type LogEntry, truncateJsonForDisplay } from "@/lib/logger";

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
            background: "#0a0e1a",
            border: "1px solid var(--border)",
            color: "#9ecfff",
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
function EntryRow({ entry }: { entry: LogEntry }) {
  const { icon: Icon, color } = LEVEL[entry.level];
  const hasJson = entry.json?.request !== undefined || entry.json?.response !== undefined;

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
                <JsonBlock label="请求" data={entry.json.request} />
              )}
              {entry.json?.response !== undefined && (
                <JsonBlock label="响应" data={entry.json.response} />
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
}

export default function LogPanel({ entries }: LogPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border-b shrink-0" style={{ borderColor: "var(--border)" }}>
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full px-3 py-2 hover:bg-[var(--hover)] transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <ScrollText size={12} style={{ color: "var(--muted)" }} />
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            工作日志
          </span>
          {entries.length > 0 && (
            <span
              className="text-xs px-1.5 py-0 rounded-full"
              style={{ background: "var(--hover)", color: "var(--muted)" }}
            >
              {entries.length}
            </span>
          )}
        </div>
        {open
          ? <ChevronDown size={12} style={{ color: "var(--muted)" }} />
          : <ChevronRight size={12} style={{ color: "var(--muted)" }} />
        }
      </button>

      {/* Entries */}
      {open && (
        <div
          className="overflow-y-auto"
          style={{ maxHeight: "220px" }}
        >
          {entries.length === 0 ? (
            <p className="px-3 py-3 text-xs" style={{ color: "var(--muted)" }}>
              暂无日志
            </p>
          ) : (
            entries.map((e) => <EntryRow key={e.id} entry={e} />)
          )}
        </div>
      )}
    </div>
  );
}
