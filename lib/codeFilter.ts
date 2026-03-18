import type { TreeNode } from "./github";

const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "pyw",
  "rs",
  "go",
  "java", "kt", "kts", "scala",
  "cpp", "cc", "cxx", "c", "h", "hpp",
  "cs",
  "rb",
  "php",
  "swift",
  "sh", "bash", "zsh", "fish",
  "lua", "r", "dart",
  "ex", "exs", "elm", "zig",
  "vue", "svelte", "astro",
  "html", "css", "scss", "sass", "less",
  "sql", "graphql", "gql",
  "tf", "hcl",
  "json", "yaml", "yml", "toml",
  "md", "mdx",
]);

const CODE_FILENAMES = new Set([
  "dockerfile", "makefile", "jenkinsfile",
  "rakefile", "gemfile", "procfile",
  ".babelrc", ".eslintrc", ".prettierrc", ".gitignore",
]);

const EXCLUDE_PATTERNS = [
  /node_modules\//,
  /\.git\//,
  /^dist\//,
  /^build\//,
  /^\.next\//,
  /^coverage\//,
  /^vendor\//,
  /\.min\.(js|css)$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /composer\.lock$/,
  /Gemfile\.lock$/,
  /Cargo\.lock$/,
];

export function filterCodeFiles(nodes: TreeNode[]): string[] {
  const paths: string[] = [];

  function walk(nodeList: TreeNode[]) {
    for (const node of nodeList) {
      if (node.type === "tree") {
        if (node.children) walk(node.children);
      } else {
        if (EXCLUDE_PATTERNS.some((p) => p.test(node.path))) continue;
        const filename = node.name.toLowerCase();
        const ext = filename.includes(".")
          ? (filename.split(".").pop() ?? "")
          : "";
        if (CODE_EXTENSIONS.has(ext) || CODE_FILENAMES.has(filename)) {
          paths.push(node.path);
        }
      }
    }
  }

  walk(nodes);
  return paths;
}
