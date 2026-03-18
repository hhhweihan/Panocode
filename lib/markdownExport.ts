import type { AnalysisRecord } from "@/lib/storage";
import type { TreeNode } from "@/lib/github";
import type { CallgraphNode, CallgraphResult } from "@/app/api/analyze/callgraph/route";

// ── File tree ASCII ───────────────────────────────────────────────────────────

function renderFileTree(nodes: TreeNode[], prefix = "", depth = 0): string {
  if (depth >= 4) return "";
  const lines: string[] = [];
  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    const connector = isLast ? "└── " : "├── ";
    lines.push(`${prefix}${connector}${node.name}`);
    if (node.type === "tree" && node.children && node.children.length > 0) {
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      lines.push(renderFileTree(node.children, childPrefix, depth + 1));
    }
  });
  return lines.filter(Boolean).join("\n");
}

// ── Call graph ASCII ──────────────────────────────────────────────────────────

function drillDownLabel(drillDown: number): string {
  if (drillDown === 1) return "[KEY]";
  if (drillDown === 0) return "[EXT]";
  return "[---]";
}

function nodeTypeLabel(node: CallgraphNode): string {
  return [
    node.nodeType === "controller" ? "[CTRL]" : null,
    node.bridgeNote ? "[BRIDGE]" : null,
  ].filter(Boolean).join(" ");
}

function renderCallgraphAscii(
  node: CallgraphNode & { children?: (CallgraphNode & { children?: unknown[] })[] },
  prefix = "",
  isLast = true,
): string {
  const connector = isLast ? "└── " : "├── ";
  const parts = [drillDownLabel(node.drillDown), nodeTypeLabel(node), node.routePath ? `[${node.routePath}]` : "", node.name]
    .filter(Boolean);
  const label = parts.join(" ");
  const desc = node.description ? ` — ${node.description}` : "";
  let line = `${prefix}${connector}${label}${desc}`;

  if (node.children && node.children.length > 0) {
    const childPrefix = prefix + (isLast ? "    " : "│   ");
    const childLines = (node.children as (CallgraphNode & { children?: unknown[] })[]).map((child, i) =>
      renderCallgraphAscii(child, childPrefix, i === node.children!.length - 1)
    );
    line = [line, ...childLines].join("\n");
  }
  return line;
}

function renderCallgraph(result: CallgraphResult): string {
  const rootLine = result.bridge
    ? `${result.rootFunction} (${result.entryFile}) [bridge: ${result.bridge.strategyName}]`
    : `${result.rootFunction} (${result.entryFile})`;
  const lines = [rootLine];
  result.children.forEach((child, i) => {
    lines.push(
      renderCallgraphAscii(
        child as CallgraphNode & { children?: (CallgraphNode & { children?: unknown[] })[] },
        "",
        i === result.children.length - 1,
      )
    );
  });
  return lines.join("\n");
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildMarkdown(record: AnalysisRecord): string {
  const { repoMeta, analysisResult, entryCheckResults, callgraphResult, moduleAnalysis, logs, fileTree, url } = record;
  const { owner, repo, branch, description, stars } = repoMeta;
  const analyzedDate = new Date(record.analyzedAt).toLocaleString();

  const lines: string[] = [];

  // Title
  lines.push(`# Panocode Analysis: ${owner}/${repo}`);
  lines.push("");
  lines.push(
    `> Analyzed: ${analyzedDate} · Branch: \`${branch}\`${stars !== undefined ? ` · ⭐ ${stars.toLocaleString()}` : ""} · [${url}](${url})`
  );
  lines.push("");

  // Description
  if (description) {
    lines.push("## Description");
    lines.push("");
    lines.push(description);
    lines.push("");
  }

  // Languages
  lines.push("## Languages");
  lines.push("");
  lines.push("| Language | Percentage | Color |");
  lines.push("|----------|-----------|-------|");
  for (const lang of analysisResult.languages) {
    lines.push(`| ${lang.name} | ${lang.percentage}% | \`${lang.color}\` |`);
  }
  lines.push("");

  // Tech Stack
  if (analysisResult.techStack.length > 0) {
    lines.push("## Tech Stack");
    lines.push("");
    // Group by category
    const byCategory = new Map<string, string[]>();
    for (const tech of analysisResult.techStack) {
      const cat = tech.category;
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(tech.name);
    }
    for (const [cat, techs] of byCategory.entries()) {
      lines.push(`**${cat.charAt(0).toUpperCase() + cat.slice(1)}**: ${techs.join(", ")}`);
      lines.push("");
    }
  }

  // Summary
  if (analysisResult.summary) {
    lines.push("## Project Summary");
    lines.push("");
    lines.push(analysisResult.summary);
    lines.push("");
  }

  // Entry file analysis
  if (Object.keys(entryCheckResults).length > 0) {
    lines.push("## Entry File Analysis");
    lines.push("");
    for (const [path, result] of Object.entries(entryCheckResults)) {
      const status = result.isEntry ? "✅ Confirmed entry" : "❌ Not entry";
      lines.push(`**\`${path}\`** — ${status} (${result.confidence} confidence)`);
      lines.push(`> ${result.reason}`);
      lines.push("");
    }
  }

  // File Tree
  if (fileTree.length > 0) {
    lines.push("## File Tree");
    lines.push("");
    lines.push("```");
    lines.push(`${owner}/${repo}`);
    lines.push(renderFileTree(fileTree));
    lines.push("```");
    lines.push("");
  }

  // Call Graph
  if (callgraphResult) {
    lines.push("## Call Graph");
    lines.push("");
    lines.push("```");
    lines.push(renderCallgraph(callgraphResult));
    lines.push("```");
    lines.push("");
    lines.push("Legend: `[KEY]` = key internal subsystem · `[EXT]` = uncertain · `[---]` = trivial/external · `[CTRL]` = controller handler · `[BRIDGE]` = framework bridge node");
    lines.push("");
  }

  if (moduleAnalysis && moduleAnalysis.modules.length > 0) {
    lines.push("## Functional Modules");
    lines.push("");
    for (const moduleItem of moduleAnalysis.modules) {
      lines.push(`### ${moduleItem.name}`);
      lines.push("");
      lines.push(moduleItem.description);
      lines.push("");
      lines.push(`Color: \`${moduleItem.color}\``);
      lines.push("");
      for (const functionName of moduleItem.functions) {
        lines.push(`- ${functionName}`);
      }
      lines.push("");
    }

    if (moduleAnalysis.savedFilePath) {
      lines.push(`Saved file: \`${moduleAnalysis.savedFilePath}\``);
      lines.push("");
    }
  }

  // Agent Work Log
  if (logs.length > 0) {
    lines.push("## Agent Work Log");
    lines.push("");
    lines.push("| Time | Level | Message |");
    lines.push("|------|-------|---------|");
    for (const entry of logs) {
      const msg = entry.message.replace(/\|/g, "\\|");
      lines.push(`| ${entry.time} | ${entry.level} | ${msg} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
