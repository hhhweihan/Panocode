import type { CallgraphNode, CallgraphResult } from "@/app/api/analyze/callgraph/route";

/**
 * Build a regex that matches common function/method/class definition patterns for `name`.
 * Covers Python, JS/TS, Go, Java, C#, C++, Ruby, PHP, Rust.
 */
export function buildFunctionPattern(name: string): RegExp {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    // Python: def name(  or  async def name(
    `(?:async\\s+)?def\\s+${esc}\\s*\\(`,
    // JS/TS: function name(  or  async function name(  or  function* name(
    `(?:async\\s+)?function\\s*\\*?\\s+${esc}\\s*[(<]`,
    // JS/TS: const/let/var name = (...) =>  or  const name = function
    `(?:const|let|var)\\s+${esc}\\s*=\\s*(?:async\\s+)?(?:\\([^)]*\\)|[\\w]+)\\s*=>`,
    // Go: func name(  or  func (recv) name(
    `func(?:\\s+\\([^)]*\\))?\\s+${esc}\\s*\\(`,
    // Ruby: def name  or  def self.name
    `def\\s+(?:self\\.)?${esc}(?:[\\s(<]|$)`,
    // PHP: function name(
    `function\\s+${esc}\\s*\\(`,
    // Rust: fn name(  or  pub fn name(  or  pub(crate) async fn name(
    `(?:pub(?:\\s*\\([^)]*\\))?\\s+)?(?:async\\s+)?fn\\s+${esc}\\s*[<(]`,
    // Class definition: class Name  or  class Name<  or  class Name(
    `class\\s+${esc}[\\s<{(:]`,
    // Java/C#/C++ method: returnType name(
    `[\\w<>\\[\\]*&]+\\s+${esc}\\s*\\(`,
  ];
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
