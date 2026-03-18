/**
 * panoramaExport.ts
 * Generates a standalone SVG (and optionally PNG) of the full call-graph panorama.
 * No external dependencies — uses pure SVG + Canvas API.
 */

import type { CallgraphResult, CallgraphNode } from "@/app/api/analyze/callgraph/route";
import type { ModuleAnalysisResult } from "@/lib/moduleAnalysis";
import { getFunctionModule } from "@/lib/moduleAnalysis";

// ── Layout constants (must mirror PanoramaPanel) ───────────────────────────

const ROOT_W = 260, ROOT_H = 90;
const CARD_W = 220, CARD_H = 102;
const COL_GAP = 64, CARD_GAP = 12, CONN_MARGIN = 20;
const PAD_X = 28, PAD_Y = 28;
const HEADER_H = 24;
const EXTRA_RIGHT = 60; // space for drilldown indicators on rightmost column

// ── Layout computation ─────────────────────────────────────────────────────

interface LNode { node: CallgraphNode; x: number; y: number; depth: number; path: number[] }
interface CGroup { px: number; py: number; connX: number; cx: number; cys: number[] }

function hasKids(n: CallgraphNode) { return (n.children?.length ?? 0) > 0; }

function subtreeH(node: CallgraphNode, path: number[]): number {
  const ch = node.children ?? [];
  if (ch.length === 0) return CARD_H;
  const total = ch.reduce((s, c, i) => s + subtreeH(c, [...path, i]), 0);
  return Math.max(CARD_H, total + (ch.length - 1) * CARD_GAP);
}

function colX(depth: number) { return PAD_X + ROOT_W + COL_GAP + depth * (CARD_W + COL_GAP); }

function buildLayout(result: CallgraphResult) {
  const nodes: LNode[] = [];
  const totalChildH =
    result.children.length === 0
      ? 0
      : result.children.reduce((s, c, i) => s + subtreeH(c, [i]), 0) +
        (result.children.length - 1) * CARD_GAP;

  const mainH = Math.max(ROOT_H, totalChildH);
  const rootY = PAD_Y + (mainH - ROOT_H) / 2;
  const childStartY = PAD_Y + (mainH - totalChildH) / 2;

  function layout(children: CallgraphNode[], depth: number, yStart: number, parentPath: number[]) {
    let cur = yStart;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const path = [...parentPath, i];
      const h = subtreeH(child, path);
      nodes.push({ node: child, x: colX(depth), y: cur + (h - CARD_H) / 2, depth, path });
      if (hasKids(child)) layout(child.children ?? [], depth + 1, cur, path);
      cur += h + CARD_GAP;
    }
  }
  if (result.children.length > 0) layout(result.children, 0, childStartY, []);

  const maxDepth = nodes.length > 0 ? Math.max(...nodes.map((n) => n.depth)) : -1;
  const canvasW =
    PAD_X * 2 + ROOT_W + EXTRA_RIGHT +
    (maxDepth >= 0 ? COL_GAP + (maxDepth + 1) * (CARD_W + COL_GAP) : 0);
  const canvasH = PAD_Y * 2 + mainH + 20;

  return { nodes, rootX: PAD_X, rootY, canvasW, canvasH };
}

function buildConnectors(result: CallgraphResult, nodes: LNode[], rootY: number): CGroup[] {
  const groups: CGroup[] = [];
  if (result.children.length > 0) {
    const d0 = nodes.filter((n) => n.depth === 0 && n.path.length === 1);
    groups.push({
      px: PAD_X + ROOT_W, py: rootY + ROOT_H / 2,
      connX: colX(0) - CONN_MARGIN, cx: colX(0),
      cys: d0.map((n) => n.y + CARD_H / 2),
    });
  }
  for (const ln of nodes) {
    if (!hasKids(ln.node)) continue;
    const childDepth = ln.depth + 1;
    const myKids = nodes.filter(
      (n) =>
        n.depth === childDepth &&
        n.path.length === ln.path.length + 1 &&
        n.path.slice(0, -1).every((v, i) => v === ln.path[i]),
    );
    if (!myKids.length) continue;
    groups.push({
      px: colX(ln.depth) + CARD_W, py: ln.y + CARD_H / 2,
      connX: colX(childDepth) - CONN_MARGIN, cx: colX(childDepth),
      cys: myKids.map((n) => n.y + CARD_H / 2),
    });
  }
  return groups;
}

// ── Theme ──────────────────────────────────────────────────────────────────

interface CardPalette { bg: string; header: string; border: string; text: string; desc: string; dot: string }
interface Theme {
  bg: string; border: string; accent: string; muted: string;
  key: CardPalette; normal: CardPalette; ext: CardPalette;
  root: { bg: string; header: string; border: string; name: string; file: string };
}

const DARK: Theme = {
  bg: "#0a0e1a", border: "#30363d", accent: "#58a6ff", muted: "#7d8590",
  key:    { bg: "#1a3a2e", header: "#0a1f13", border: "#22c55e55", text: "#e6edf3", desc: "#7d8590", dot: "#3fb950" },
  normal: { bg: "#0d1117", header: "#141920", border: "#30363d",   text: "#e6edf3", desc: "#7d8590", dot: "#60a5fa" },
  ext:    { bg: "#111520", header: "#181c25", border: "#2a3040",   text: "#7d8590", desc: "#5a636e", dot: "#6b7280" },
  root:   { bg: "#0f2a1a", header: "#0a1f13", border: "#22c55e55", name: "#3fb950", file: "#3fb95099" },
};

const LIGHT: Theme = {
  bg: "#f5f7fb", border: "#d8e0ec", accent: "#2563eb", muted: "#5f6f86",
  key:    { bg: "#f0fdf4", header: "#dcfce7", border: "#22c55e66", text: "#14532d", desc: "#4a7c59", dot: "#16a34a" },
  normal: { bg: "#ffffff", header: "#eef3f9", border: "#d8e0ec",   text: "#152033", desc: "#5f6f86", dot: "#3b82f6" },
  ext:    { bg: "#f7f9fc", header: "#edf1f8", border: "#d8e0ec",   text: "#5f6f86", desc: "#7d8a9a", dot: "#6b7280" },
  root:   { bg: "#f0fdf4", header: "#dcfce7", border: "#22c55e66", name: "#15803d", file: "#15803d99" },
};

function detectTheme(): Theme {
  if (typeof document === "undefined") return DARK;
  return document.documentElement.dataset.theme === "light" ? LIGHT : DARK;
}

// ── SVG helpers ────────────────────────────────────────────────────────────

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function trunc(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Split a string into at most `maxLines` lines of `maxChars` each. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const char of text) {
    if (line.length >= maxChars) {
      lines.push(line);
      line = "";
      if (lines.length >= maxLines) break;
    }
    line += char;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.slice(0, maxLines);
}

function rect(x: number, y: number, w: number, h: number, rx: number, fill: string, stroke?: string) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${esc(fill)}"${stroke ? ` stroke="${esc(stroke)}" stroke-width="1"` : ""}/>`;
}

function text(
  x: number, y: number, s: string,
  size: number, fill: string,
  opts: { bold?: boolean; mono?: boolean; anchor?: "start" | "middle" | "end" } = {},
) {
  const family = opts.mono
    ? `ui-monospace,'Cascadia Code',Consolas,monospace`
    : `ui-sans-serif,system-ui,sans-serif`;
  const anchor = opts.anchor ?? "start";
  const weight = opts.bold ? 700 : 400;
  return `<text x="${x}" y="${y}" font-size="${size}" font-family="${esc(family)}" font-weight="${weight}" fill="${esc(fill)}" text-anchor="${anchor}" dominant-baseline="middle">${esc(s)}</text>`;
}

function clipRect(id: string, x: number, y: number, w: number, h: number, rx: number) {
  return `<clipPath id="${esc(id)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/></clipPath>`;
}

// ── Card renderers ─────────────────────────────────────────────────────────

function renderRoot(
  rootX: number, rootY: number,
  result: CallgraphResult, theme: Theme,
  moduleColor?: string | null,
): string {
  const c = theme.root;
  const hdrFill = moduleColor ?? c.header;
  const borderCol = moduleColor ? moduleColor + "88" : c.border;
  const filename = result.entryFile.split("/").pop() ?? result.entryFile;
  const clipId = "clip-root";

  return [
    clipRect(clipId, rootX, rootY, ROOT_W, ROOT_H, 10),
    rect(rootX, rootY, ROOT_W, ROOT_H, 10, c.bg, borderCol),
    // header strip
    `<rect x="${rootX}" y="${rootY}" width="${ROOT_W}" height="${HEADER_H}" fill="${esc(hdrFill)}" clip-path="url(#${clipId})"/>`,
    `<line x1="${rootX}" y1="${rootY + HEADER_H}" x2="${rootX + ROOT_W}" y2="${rootY + HEADER_H}" stroke="${esc(borderCol)}" stroke-width="0.5"/>`,
    // header text
    text(rootX + 10, rootY + HEADER_H / 2, trunc(filename, 28), 10, moduleColor ? "#ffffffdd" : c.name, { mono: true }),
    // function name
    `<circle cx="${rootX + 12}" cy="${rootY + HEADER_H + 18}" r="4" fill="${esc(c.name)}"/>`,
    text(rootX + 22, rootY + HEADER_H + 18, trunc(result.rootFunction, 22), 14, c.name, { bold: true, mono: true }),
    // entry file path
    text(rootX + 10, rootY + HEADER_H + 42, trunc(result.entryFile, 32), 10, c.file, { mono: true }),
  ].join("\n");
}

function renderChild(
  x: number, y: number,
  node: CallgraphNode, locale: "zh" | "en",
  theme: Theme, idx: number,
  moduleColor?: string | null,
): string {
  const dk = node.drillDown as -1 | 0 | 1;
  const s = dk === 1 ? theme.key : dk === -1 ? theme.ext : theme.normal;
  const hdrFill = moduleColor ?? s.header;
  const borderCol = moduleColor ? moduleColor + "88" : s.border;
  const filename = node.likelyFile ? (node.likelyFile.split("/").pop() ?? node.likelyFile) : "—";
  const label = locale === "zh"
    ? (dk === 1 ? "重点" : dk === -1 ? "外部" : "")
    : (dk === 1 ? "Key" : dk === -1 ? "Ext." : "");
  const clipId = `clip-card-${idx}`;

  const parts: string[] = [
    clipRect(clipId, x, y, CARD_W, CARD_H, 8),
    rect(x, y, CARD_W, CARD_H, 8, s.bg, borderCol),
    `<rect x="${x}" y="${y}" width="${CARD_W}" height="${HEADER_H}" fill="${esc(hdrFill)}" clip-path="url(#${clipId})"/>`,
    `<line x1="${x}" y1="${y + HEADER_H}" x2="${x + CARD_W}" y2="${y + HEADER_H}" stroke="${esc(borderCol)}" stroke-width="0.5"/>`,
    text(x + 8, y + HEADER_H / 2, trunc(filename, 20), 10, moduleColor ? "#ffffffcc" : s.desc, { mono: true }),
  ];

  // label badge
  if (label) {
    const bw = Math.max(28, label.length * 6 + 10);
    const bx = x + CARD_W - bw - 6;
    parts.push(rect(bx, y + 6, bw, 13, 6, "transparent", s.dot));
    parts.push(text(bx + bw / 2, y + HEADER_H / 2, label, 9, s.dot, { anchor: "middle" }));
  }

  // body
  parts.push(`<circle cx="${x + 14}" cy="${y + HEADER_H + 16}" r="3" fill="${esc(s.dot)}"/>`);
  parts.push(text(x + 23, y + HEADER_H + 16, trunc(node.name, 20), 12, s.text, { bold: true, mono: true }));

  let bodyY = y + HEADER_H + 34;
  const route = node.routePath?.trim();
  if (route) {
    parts.push(rect(x + 22, bodyY - 7, 22, 12, 6, "transparent", s.desc));
    parts.push(text(x + 33, bodyY - 1, "URL", 8, s.desc, { anchor: "middle" }));
    parts.push(text(x + 50, bodyY - 1, trunc(route, 20), 10, theme.accent, { mono: true }));
    bodyY += 16;
  }

  if (node.description) {
    const lines = wrap(node.description, 26, route ? 1 : 2);
    lines.forEach((line, i) => {
      parts.push(text(x + 22, bodyY + i * 14 + 4, line, 10, s.desc));
    });
  }

  // drilldown indicator on leaf
  if (!hasKids(node) && dk !== -1) {
    const bx = x + CARD_W + 6;
    const by = y + CARD_H / 2;
    parts.push(
      `<line x1="${bx}" y1="${by}" x2="${bx + 16}" y2="${by}" stroke="${esc(theme.accent)}" stroke-width="1.5" stroke-dasharray="4 3"/>`,
      `<circle cx="${bx + 16 + 12}" cy="${by}" r="11" fill="${esc(theme.bg)}" stroke="${esc(theme.accent)}" stroke-width="1.5"/>`,
      text(bx + 16 + 12, by, "↓", 10, theme.accent, { anchor: "middle" }),
    );
  }

  return parts.join("\n");
}

// ── Legend ─────────────────────────────────────────────────────────────────

function renderLegend(x: number, y: number, theme: Theme, locale: "zh" | "en"): string {
  const items: Array<{ color: string; label: string }> = [
    { color: theme.key.dot,    label: locale === "zh" ? "重点 (关键函数)" : "Key (core function)" },
    { color: theme.normal.dot, label: locale === "zh" ? "普通 (内部函数)" : "Normal (internal)" },
    { color: theme.ext.dot,    label: locale === "zh" ? "外部 (外部依赖)" : "Ext. (external dep)" },
  ];
  const parts: string[] = [];
  items.forEach((item, i) => {
    const ix = x + i * 160;
    parts.push(`<circle cx="${ix + 6}" cy="${y + 6}" r="4" fill="${esc(item.color)}"/>`);
    parts.push(text(ix + 14, y + 6, item.label, 10, theme.muted));
  });
  return parts.join("\n");
}

// ── Main SVG builder ───────────────────────────────────────────────────────

export interface PanoramaExportData {
  result: CallgraphResult;
  moduleAnalysis?: ModuleAnalysisResult | null;
  locale: "zh" | "en";
  repoName?: string;
}

export function buildPanoramaSvg(data: PanoramaExportData): string {
  const { result, moduleAnalysis, locale, repoName } = data;
  const theme = detectTheme();
  const { nodes, rootX, rootY, canvasW, canvasH } = buildLayout(result);
  const connGroups = buildConnectors(result, nodes, rootY);

  const TITLE_H = 36;
  const LEGEND_H = 28;
  const totalH = TITLE_H + canvasH + LEGEND_H;

  const parts: string[] = [];

  // ── Background ──
  parts.push(rect(0, 0, canvasW, totalH, 0, theme.bg));

  // ── Title bar ──
  const titleText = repoName
    ? (locale === "zh" ? `全景图 · ${repoName}` : `Panorama · ${repoName}`)
    : (locale === "zh" ? "全景调用图" : "Call Graph Panorama");
  parts.push(text(PAD_X, TITLE_H / 2, titleText, 13, theme.muted, { bold: true }));
  const generatedAt = new Date().toLocaleString();
  parts.push(text(canvasW - PAD_X, TITLE_H / 2, generatedAt, 10, theme.muted, { anchor: "end" }));
  parts.push(`<line x1="0" y1="${TITLE_H}" x2="${canvasW}" y2="${TITLE_H}" stroke="${esc(theme.border)}" stroke-width="0.5"/>`);

  // ── All SVG content offset by TITLE_H ──
  const OY = TITLE_H;

  // Connector lines
  const connColor = theme.border;
  for (const g of connGroups) {
    if (!g.cys.length) continue;
    const minY = Math.min(g.py, ...g.cys);
    const maxY = Math.max(g.py, ...g.cys);
    const lineAttrs = `stroke="${esc(connColor)}" stroke-width="1.5" stroke-dasharray="5 4" fill="none"`;
    parts.push(`<line ${lineAttrs} x1="${g.px}" y1="${g.py + OY}" x2="${g.connX}" y2="${g.py + OY}"/>`);
    parts.push(`<line ${lineAttrs} x1="${g.connX}" y1="${minY + OY}" x2="${g.connX}" y2="${maxY + OY}"/>`);
    for (const cy of g.cys) {
      parts.push(`<line ${lineAttrs} x1="${g.connX}" y1="${cy + OY}" x2="${g.cx}" y2="${cy + OY}"/>`);
    }
  }

  // Root card
  parts.push(renderRoot(
    rootX, rootY + OY,
    result, theme,
    getFunctionModule(moduleAnalysis, result.rootFunction)?.color,
  ));

  // Child cards
  nodes.forEach((ln, i) => {
    parts.push(renderChild(
      ln.x, ln.y + OY,
      ln.node, locale, theme, i,
      getFunctionModule(moduleAnalysis, ln.node.name)?.color,
    ));
  });

  // ── Legend ──
  const legendY = TITLE_H + canvasH + 8;
  parts.push(`<line x1="0" y1="${legendY - 4}" x2="${canvasW}" y2="${legendY - 4}" stroke="${esc(theme.border)}" stroke-width="0.5"/>`);
  parts.push(renderLegend(PAD_X, legendY, theme, locale));

  const svgContent = parts.join("\n");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${totalH}" viewBox="0 0 ${canvasW} ${totalH}">`,
    `<defs>`,
    `  <style>text { font-smoothing: antialiased; }</style>`,
    `</defs>`,
    svgContent,
    `</svg>`,
  ].join("\n");
}

// ── Download utilities ─────────────────────────────────────────────────────

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function downloadPanoramaAsSvg(data: PanoramaExportData, filename: string) {
  const svg = buildPanoramaSvg(data);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}

export function downloadPanoramaAsPng(
  data: PanoramaExportData,
  filename: string,
  scale = 2,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const svg = buildPanoramaSvg(data);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) { reject(new Error("PNG conversion failed")); return; }
        const pngUrl = URL.createObjectURL(pngBlob);
        triggerDownload(pngUrl, filename);
        URL.revokeObjectURL(pngUrl);
        resolve();
      }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG load failed")); };
    img.src = url;
  });
}

export function downloadPanoramaAsJson(result: CallgraphResult, filename: string) {
  const json = JSON.stringify(result, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}
