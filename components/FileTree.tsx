"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  FileJson,
  Image as ImageIcon,
} from "lucide-react";
import type { TreeNode } from "@/lib/github";

const CODE_EXTS = new Set(["ts", "tsx", "js", "jsx", "py", "rs", "go", "java", "kt", "cpp", "c", "cs", "rb", "php", "swift", "sh", "bash", "lua", "r", "dart", "ex", "exs", "vue", "svelte", "html", "css", "scss", "sql", "tf"]);
const TEXT_EXTS = new Set(["md", "mdx", "txt", "rst"]);
const JSON_EXTS = new Set(["json", "yaml", "yml", "toml", "xml"]);
const IMG_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"]);

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (IMG_EXTS.has(ext)) return <ImageIcon size={14} className="shrink-0 text-yellow-400" />;
  if (JSON_EXTS.has(ext)) return <FileJson size={14} className="shrink-0 text-orange-400" />;
  if (TEXT_EXTS.has(ext)) return <FileText size={14} className="shrink-0 text-slate-400" />;
  if (CODE_EXTS.has(ext)) return <FileCode size={14} className="shrink-0 text-blue-400" />;
  return <File size={14} className="shrink-0 text-slate-500" />;
}

interface FileNodeProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onFileClick: (node: TreeNode) => void;
}

function FileNode({ node, depth, selectedPath, onFileClick }: FileNodeProps) {
  const [open, setOpen] = useState(depth < 1);
  const isSelected = selectedPath === node.path;
  const indent = depth * 12;

  if (node.type === "tree") {
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 w-full text-left px-2 py-0.5 rounded hover:bg-[var(--hover)] text-sm text-[var(--text)] group"
          style={{ paddingLeft: `${8 + indent}px` }}
        >
          <span className="text-[var(--muted)] shrink-0">
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
          {open
            ? <FolderOpen size={14} className="shrink-0 text-[#58a6ff]" />
            : <Folder size={14} className="shrink-0 text-[#58a6ff]" />
          }
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children && (
          <div>
            {node.children.map((child) => (
              <FileNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onFileClick={onFileClick}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onFileClick(node)}
      className={`flex items-center gap-1.5 w-full text-left px-2 py-0.5 rounded text-sm truncate ${
        isSelected
          ? "bg-[var(--selected)] text-[var(--accent)]"
          : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
      }`}
      style={{ paddingLeft: `${8 + indent}px` }}
      title={node.path}
    >
      {getFileIcon(node.name)}
      <span className="truncate">{node.name}</span>
    </button>
  );
}

interface FileTreeProps {
  tree: TreeNode[];
  selectedPath: string | null;
  onFileClick: (node: TreeNode) => void;
}

export default function FileTree({ tree, selectedPath, onFileClick }: FileTreeProps) {
  return (
    <div className="py-2">
      {tree.map((node) => (
        <FileNode
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onFileClick={onFileClick}
        />
      ))}
    </div>
  );
}
