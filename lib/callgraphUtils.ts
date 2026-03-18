import type { CallgraphNode, CallgraphResult } from "@/app/api/analyze/callgraph/route";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseQualifiedFunctionName(name: string): {
  fullName: string;
  ownerName: string | null;
  methodName: string;
} {
  const trimmed = name.trim();
  const separator = trimmed.includes("::") ? "::" : trimmed.includes(".") ? "." : null;

  if (!separator) {
    return { fullName: trimmed, ownerName: null, methodName: trimmed };
  }

  const parts = trimmed.split(separator).filter(Boolean);
  return {
    fullName: trimmed,
    ownerName: parts.slice(0, -1).join(separator) || null,
    methodName: parts[parts.length - 1] ?? trimmed,
  };
}

/**
 * Build a regex that matches common function/method/class definition patterns for `name`.
 * Covers Python, JS/TS, Go, Java, C#, C++, Ruby, PHP, Rust.
 */
export function buildFunctionPattern(name: string): RegExp {
  const { fullName, methodName } = parseQualifiedFunctionName(name);
  const candidates = Array.from(new Set([fullName, methodName].filter(Boolean)));
  const patterns: string[] = [];

  for (const candidate of candidates) {
    const esc = escapeRegExp(candidate);
    patterns.push(
      `(?:async\\s+)?def\\s+${esc}\\s*\\(`,
      `(?:async\\s+)?function\\s*\\*?\\s+${esc}\\s*[(<]`,
      `(?:const|let|var)\\s+${esc}\\s*=\\s*(?:async\\s+)?(?:\\([^)]*\\)|[\\w]+)\\s*=>`,
      `func(?:\\s+\\([^)]*\\))?\\s+${esc}\\s*\\(`,
      `def\\s+(?:self\\.)?${esc}(?:[\\s(<]|$)`,
      `function\\s+${esc}\\s*\\(`,
      `(?:pub(?:\\s*\\([^)]*\\))?\\s+)?(?:async\\s+)?fn\\s+${esc}\\s*[<(]`,
      `class\\s+${esc}[\\s<{(:]`,
      `[\\w<>\\[\\]*&:~]+\\s+${esc}\\s*\\(`,
      `^[^\\S\\r\\n]*(?:(?:public|private|protected|static|virtual|override|async|inline|constexpr|friend|final)\\s+)*(?:get\\s+|set\\s+)?${esc}\\s*\\(`,
    );
  }

  if (fullName.includes("::")) {
    patterns.push(`(?:[\\w:<>,~*&\\s]+)?${escapeRegExp(fullName)}\\s*\\(`);
  }

  return new RegExp(patterns.join("|"), "m");
}

/**
 * Find the first occurrence of `name` in `content` and extract up to `maxLines` lines.
 * Returns null if not found.
 */
export function extractFunctionSnippet(
  content: string,
  name: string,
  maxLines = 120,
): string | null {
  const pattern = buildFunctionPattern(name);
  const match = pattern.exec(content);
  if (!match) return null;

  // Find start of the matched line
  const before = content.slice(0, match.index);
  const lineStart = before.lastIndexOf("\n") + 1;
  const lines = content.slice(lineStart).split("\n");
  return lines.slice(0, maxLines).join("\n");
}

/**
 * Immutably add children to a node identified by `path` in the callgraph tree.
 * `path` is an array of indices: [2] sets result.children[2].children,
 * [2, 1] sets result.children[2].children![1].children, etc.
 */
export function addChildrenToNode(
  result: CallgraphResult,
  path: number[],
  newChildren: CallgraphNode[],
): CallgraphResult {
  if (path.length === 0) return result;

  function updateList(nodes: CallgraphNode[], segments: number[]): CallgraphNode[] {
    const [head, ...rest] = segments;
    return nodes.map((node, i) => {
      if (i !== head) return node;
      if (rest.length === 0) return { ...node, children: newChildren };
      return { ...node, children: updateList(node.children ?? [], rest) };
    });
  }

  return { ...result, children: updateList(result.children, path) };
}

export function serializeCallgraphPath(path: number[]): string {
  return path.length === 0 ? "root" : path.join(".");
}

export function getNodeAtPath(
  result: CallgraphResult,
  path: number[],
): CallgraphNode | null {
  let currentChildren = result.children;
  let currentNode: CallgraphNode | null = null;

  for (const index of path) {
    currentNode = currentChildren[index] ?? null;
    if (!currentNode) {
      return null;
    }
    currentChildren = currentNode.children ?? [];
  }

  return currentNode;
}
