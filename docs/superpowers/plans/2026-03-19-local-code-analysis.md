# Local Code Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local-filesystem project analysis to Panocode alongside the existing GitHub analysis, with a shared `DataSource` abstraction and a two-tab homepage UI.

**Architecture:** A `LocalDataSource` class reads the local filesystem server-side via Node.js `fs`; two new API routes (`/api/local/tree` and `/api/local/file`) expose it to the browser. The `app/analyze/page.tsx` orchestrator dispatches file-fetching calls to the correct source based on query params (`source`, `mode`, `path`). All AI analysis routes remain unchanged (they already accept raw `fileContent`).

**Tech Stack:** Next.js 14 App Router, TypeScript, Node.js `fs`, File System Access API (browser), lucide-react, existing CSS variable theming.

**Spec:** `docs/superpowers/specs/2026-03-19-local-code-analysis-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `lib/github.ts` | Make `TreeNode.sha` optional |
| Create | `lib/datasource/index.ts` | `ProjectInfo` and `DataSource` interfaces |
| Create | `lib/datasource/local.ts` | `LocalDataSource` — server-side fs access |
| Create | `lib/localFileStore.ts` | Client-only singleton for `FileSystemDirectoryHandle` |
| Create | `lib/localTreeBuilder.ts` | Client-only recursive tree builder from directory handle |
| Create | `app/api/local/tree/route.ts` | `GET /api/local/tree?path=` |
| Create | `app/api/local/file/route.ts` | `GET /api/local/file?root=&file=` |
| Modify | `lib/storage.ts` | Add `source?`, `displayName?` to `AnalysisRecord`; update `buildSummary` |
| Modify | `app/page.tsx` | Two-tab homepage (GitHub / 本地项目) |
| Modify | `app/analyze/page.tsx` | Source/mode dispatch; new params; local top bar; handle expiry |

---

## Task 1: Make `TreeNode.sha` optional

**Files:**
- Modify: `lib/github.ts`

- [ ] **Step 1: Change `sha` to optional in `TreeNode`**

In `lib/github.ts`, find the `TreeNode` interface and change:
```typescript
// Before
sha: string;
// After
sha?: string;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd E:\Workspace\panocode
npx tsc --noEmit
```

Expected: TypeScript may report errors at callsites that use `node.sha` without a guard. Note every reported error location — you will fix them in Task 8 (the analyze page callsites) and nowhere else for now. If errors appear only in `app/analyze/page.tsx`, that is correct and expected.

The one callsite in `lib/github.ts` itself is `buildTree` which assigns `sha: item.sha` — `TreeItem.sha` is still `string` (non-optional), so this line is fine.

- [ ] **Step 3: Commit**

```bash
git add lib/github.ts
git commit -m "refactor: make TreeNode.sha optional for local filesystem support"
```

---

## Task 2: Create `lib/datasource/index.ts`

**Files:**
- Create: `lib/datasource/index.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/datasource/index.ts
import type { TreeNode } from "@/lib/github";

export interface ProjectInfo {
  name: string;
  source: "github" | "local";
  description?: string | null;
  // GitHub-only fields (undefined for local source)
  owner?: string;
  repo?: string;
  branch?: string;
  stars?: number;
  forks?: number;
  openIssues?: number;
  updatedAt?: string | null;
  primaryLanguage?: string | null;
  license?: string | null;
  topics?: string[];
  homepage?: string | null;
}

export interface DataSource {
  getTree(): Promise<{ info: ProjectInfo; tree: TreeNode[] }>;
  getFile(path: string): Promise<string>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add lib/datasource/index.ts
git commit -m "feat: add DataSource interface and ProjectInfo type"
```

---

## Task 3: Create `lib/datasource/local.ts`

**Files:**
- Create: `lib/datasource/local.ts`

- [ ] **Step 1: Create the LocalDataSource**

```typescript
// lib/datasource/local.ts
import fs from "fs";
import path from "path";
import type { TreeNode } from "@/lib/github";
import type { ProjectInfo } from "@/lib/datasource/index";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  "out", "coverage", ".cache", "__pycache__", ".venv", "vendor",
]);

function walkDir(dir: string, root: string): TreeNode[] {
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  const dirs: TreeNode[] = [];
  const files: TreeNode[] = [];

  for (const dirent of dirents) {
    if (SKIP_DIRS.has(dirent.name)) continue;

    // Resolve and check for symlinks
    const fullPath = path.join(dir, dirent.name);
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink()) continue;

    const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");

    if (dirent.isDirectory()) {
      const children = walkDir(fullPath, root);
      dirs.push({
        name: dirent.name,
        path: relativePath,
        type: "tree",
        children,
      });
    } else if (dirent.isFile()) {
      files.push({
        name: dirent.name,
        path: relativePath,
        type: "blob",
      });
    }
  }

  // Sort: directories first, then files, both alphabetically
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return [...dirs, ...files];
}

export class LocalDataSource {
  private resolvedRoot: string;

  constructor(root: string) {
    this.resolvedRoot = path.resolve(root);
  }

  getTree(): { info: ProjectInfo; tree: TreeNode[] } {
    const tree = walkDir(this.resolvedRoot, this.resolvedRoot);
    const info: ProjectInfo = {
      name: path.basename(this.resolvedRoot),
      source: "local",
    };
    return { info, tree };
  }

  getFile(relativePath: string): string {
    const resolvedFile = path.resolve(this.resolvedRoot, relativePath);
    const rootWithSep = this.resolvedRoot + path.sep;

    if (
      resolvedFile !== this.resolvedRoot &&
      !resolvedFile.startsWith(rootWithSep)
    ) {
      throw Object.assign(new Error("Path traversal detected"), { code: "TRAVERSAL" });
    }

    const buf = fs.readFileSync(resolvedFile);
    // Binary file detection: null byte in first 8KB
    const sample = buf.slice(0, 8192);
    if (sample.includes(0)) return "";
    return buf.toString("utf8");
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors from `lib/datasource/local.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/datasource/local.ts
git commit -m "feat: add LocalDataSource for server-side filesystem access"
```

---

## Task 4: Create `/api/local/tree` route

**Files:**
- Create: `app/api/local/tree/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/local/tree/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { LocalDataSource } from "@/lib/datasource/local";

export async function GET(req: NextRequest) {
  const localPath = req.nextUrl.searchParams.get("path");

  if (!localPath) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
  }

  const resolved = path.resolve(localPath);

  // Check path exists and is a directory
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "Path not found" }, { status: 404 });
  }

  try {
    const ds = new LocalDataSource(resolved);
    const { info, tree } = ds.getTree();

    // Return synthetic RepoInfo-compatible flat fields alongside info and tree
    // This lets the analyze page use existing RepoInfo-typed state without widening the type
    return NextResponse.json({
      info,
      tree,
      // Synthetic RepoInfo fields
      owner: "",
      repo: info.name,
      branch: "",
      fullName: resolved,   // absolute path — used as dedup key in history
      description: null,
      homepage: null,
      primaryLanguage: null,
      license: null,
      topics: [],
      stars: undefined,
      forks: undefined,
      openIssues: undefined,
      updatedAt: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to read directory: ${msg}` }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manually test the route**

Start the dev server: `npm run dev`

In a browser or curl, make a request (replace path with an actual local path on your machine):

```
GET http://localhost:3000/api/local/tree?path=C:\Users\<you>\some-project
```

Expected: JSON with `info`, `tree`, and synthetic `RepoInfo` fields. The `tree` should contain `TreeNode` entries with `type: "blob" | "tree"` and no `sha`.

Also test error cases:
- Missing `path` param → 400
- Non-existent path → 404

- [ ] **Step 3: Commit**

```bash
git add app/api/local/tree/route.ts
git commit -m "feat: add GET /api/local/tree route for local filesystem"
```

---

## Task 5: Create `/api/local/file` route

**Files:**
- Create: `app/api/local/file/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// app/api/local/file/route.ts
import { NextRequest, NextResponse } from "next/server";
import { LocalDataSource } from "@/lib/datasource/local";

export async function GET(req: NextRequest) {
  const root = req.nextUrl.searchParams.get("root");
  const file = req.nextUrl.searchParams.get("file");

  if (!root || !file) {
    return NextResponse.json({ error: "Missing root or file parameter" }, { status: 400 });
  }

  try {
    const ds = new LocalDataSource(root);
    const content = ds.getFile(file);
    return NextResponse.json({ content });
  } catch (err) {
    if (err instanceof Error) {
      if ((err as NodeJS.ErrnoException).code === "TRAVERSAL") {
        return NextResponse.json({ error: "Path traversal detected" }, { status: 403 });
      }
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manually test the route**

```
GET http://localhost:3000/api/local/file?root=C:\path\to\project&file=src/index.ts
```

Expected: `{ content: "..." }` with the file contents.

Test path traversal:
```
GET http://localhost:3000/api/local/file?root=C:\path\to\project&file=../../etc/passwd
```
Expected: 403 or 404 (path resolves outside root).

- [ ] **Step 3: Commit**

```bash
git add app/api/local/file/route.ts
git commit -m "feat: add GET /api/local/file route with path traversal guard"
```

---

## Task 6: Storage updates + client-side file store + tree builder

**Files:**
- Modify: `lib/storage.ts`
- Create: `lib/localFileStore.ts`
- Create: `lib/localTreeBuilder.ts`

### 6a: Update `lib/storage.ts`

- [ ] **Step 1: Add `source` and `displayName` to `AnalysisRecord`**

In `lib/storage.ts`, find the `AnalysisRecord` interface and add two optional fields after `repoMeta`:

```typescript
export interface AnalysisRecord {
  id: string;
  analyzedAt: string;
  url: string;
  repoMeta: {
    owner: string;
    repo: string;
    branch: string;
    fullName: string;
    description: string | null;
    homepage?: string | null;
    primaryLanguage?: string | null;
    license?: string | null;
    topics?: string[];
    stars?: number;
    forks?: number;
    openIssues?: number;
    updatedAt?: string | null;
  };
  // NEW: optional for backward compat (absent on existing records = 'github')
  source?: "github" | "local";
  displayName?: string;
  // ... rest of fields unchanged
  fileTree: TreeNode[];
  analysisResult: AnalysisResult;
  entryCheckResults: Record<string, EntryCheckResult>;
  callgraphResult: CallgraphResult | null;
  moduleAnalysis: ModuleAnalysisResult | null;
  logs: LogEntry[];
}
```

- [ ] **Step 2: Add `source` to `AnalysisRecordSummary`**

Find `AnalysisRecordSummary` and add:

```typescript
export interface AnalysisRecordSummary {
  id: string;
  analyzedAt: string;
  url: string;
  repoName: string;
  description: string | null;
  topLanguages: { name: string; color: string }[];
  source?: "github" | "local";  // NEW
}
```

- [ ] **Step 3: Update `buildSummary`**

Find `buildSummary` and update two fields:

```typescript
export function buildSummary(record: AnalysisRecord): AnalysisRecordSummary {
  return {
    id: record.id,
    analyzedAt: record.analyzedAt,
    url: record.url,
    repoName: record.displayName ?? record.repoMeta.fullName,  // CHANGED
    description: record.repoMeta.description,
    topLanguages: record.analysisResult.languages
      .slice(0, 2)
      .map((l) => ({ name: l.name, color: l.color })),
    source: record.source,  // NEW
  };
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no new errors from storage changes.

### 6b: Create `lib/localFileStore.ts`

- [ ] **Step 5: Create the client-only store**

```typescript
// lib/localFileStore.ts
// CLIENT-ONLY — never import in server code or API routes

let _handle: FileSystemDirectoryHandle | null = null;

export function setHandle(h: FileSystemDirectoryHandle): void {
  _handle = h;
}

export function getHandle(): FileSystemDirectoryHandle | null {
  return _handle;
}

export function clearHandle(): void {
  _handle = null;
}
```

### 6c: Create `lib/localTreeBuilder.ts`

- [ ] **Step 6: Create the client-side tree builder**

```typescript
// lib/localTreeBuilder.ts
// CLIENT-ONLY — uses FileSystemDirectoryHandle (browser API)

import type { TreeNode } from "@/lib/github";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  "out", "coverage", ".cache", "__pycache__", ".venv", "vendor",
]);

export async function buildLocalTree(
  dirHandle: FileSystemDirectoryHandle,
  relativePath = "",
): Promise<TreeNode[]> {
  const dirs: TreeNode[] = [];
  const files: TreeNode[] = [];

  for await (const entry of dirHandle.values()) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.kind === "directory") {
      const children = await buildLocalTree(
        entry as FileSystemDirectoryHandle,
        entryPath,
      );
      dirs.push({
        name: entry.name,
        path: entryPath,
        type: "tree",
        children,
      });
    } else {
      files.push({
        name: entry.name,
        path: entryPath,
        type: "blob",
      });
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return [...dirs, ...files];
}

export async function readLocalFile(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<string> {
  const parts = relativePath.split("/");
  let currentDir: FileSystemDirectoryHandle = rootHandle;

  for (let i = 0; i < parts.length - 1; i++) {
    currentDir = await currentDir.getDirectoryHandle(parts[i]);
  }

  const fileName = parts[parts.length - 1];
  const fileHandle = await currentDir.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.text();
}
```

- [ ] **Step 7: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: `FileSystemDirectoryHandle` and related types are browser globals — TypeScript should find them if `lib` includes `"dom"` in `tsconfig.json`. If you get "cannot find name 'FileSystemDirectoryHandle'" errors, check `tsconfig.json`'s `lib` array includes `"dom"`. No code change needed if `dom` is already there.

- [ ] **Step 8: Commit**

```bash
git add lib/storage.ts lib/localFileStore.ts lib/localTreeBuilder.ts
git commit -m "feat: add storage source/displayName fields, localFileStore, localTreeBuilder"
```

---

## Task 7: Homepage tab UI

**Files:**
- Modify: `app/page.tsx`

The current `app/page.tsx` has a single GitHub URL input. You will add a two-tab layout. Read the existing file carefully before editing.

- [ ] **Step 1: Read the file**

Read `app/page.tsx` in full to understand current structure before editing.

- [ ] **Step 2: Add imports**

At the top of the file, add these imports alongside the existing ones:

```typescript
import { FolderOpen } from "lucide-react";
import * as localFileStore from "@/lib/localFileStore";
```

- [ ] **Step 3: Add tab state and local path state**

Inside `HomePage`, after the existing `useState` hooks, add:

```typescript
const [activeTab, setActiveTab] = useState<"github" | "local">("github");
const [localPath, setLocalPath] = useState("");
const [localError, setLocalError] = useState("");
const [localPickerMode, setLocalPickerMode] = useState<"server" | "client">("server");
```

- [ ] **Step 4: Add local analyze handler**

After the existing `handleAnalyze` function, add:

```typescript
const handleLocalAnalyze = () => {
  if (!localPath.trim() && localPickerMode === "server") {
    setLocalError("请输入本地项目路径");
    return;
  }
  setLocalError("");
  if (localPickerMode === "client") {
    const name = localPath || "local-project";
    router.push(`/analyze?source=local&mode=client&name=${encodeURIComponent(name)}`);
  } else {
    router.push(`/analyze?source=local&path=${encodeURIComponent(localPath.trim())}`);
  }
};

const handlePickerClick = async () => {
  if (typeof window === "undefined" || typeof (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker !== "function") {
    return;
  }
  try {
    const handle = await (window as Window & { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
    localFileStore.setHandle(handle);
    setLocalPath(handle.name);
    setLocalPickerMode("client");
    setLocalError("");
  } catch {
    // User cancelled — no-op
  }
};

const handleLocalPathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setLocalPath(e.target.value);
  setLocalPickerMode("server");
  localFileStore.clearHandle();
  if (localError) setLocalError("");
};
```

- [ ] **Step 5: Replace `HistoryCard` to support source icons**

Find `HistoryCard` component. Add `source?: "github" | "local"` to its props and update rendering:

```typescript
function HistoryCard({
  summary,
  onClick,
}: {
  summary: AnalysisRecordSummary;
  onClick: () => void;
}) {
  const date = new Date(summary.analyzedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const isLocal = (summary.source ?? "github") === "local";
  const displayUrl = isLocal
    ? summary.url
    : summary.url.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  return (
    <button
      onClick={onClick}
      // ... same className and style as before
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
          {summary.repoName}
        </span>
        <span className="text-xs shrink-0" style={{ color: "var(--muted)" }}>
          {date}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-xs truncate" style={{ color: "var(--muted)" }}>
        {isLocal ? <FolderOpen size={11} style={{ flexShrink: 0 }} /> : null}
        <span className="truncate">{displayUrl}</span>
      </div>
      {/* topLanguages section unchanged */}
    </button>
  );
}
```

Also update `HistoryCard` click handler in `HomePage` for local records:

```typescript
onClick={() => {
  const isLocal = (item.source ?? "github") === "local";
  if (isLocal) {
    router.push(`/analyze?source=local&path=${encodeURIComponent(item.url)}`);
  } else {
    router.push(`/analyze?url=${encodeURIComponent(item.url)}&historyId=${item.id}`);
  }
}}
```

- [ ] **Step 6: Wrap existing content in tab structure**

Replace the current input section with a tab layout:

```tsx
{/* Tab bar */}
<div className="flex gap-0 mb-6 border-b" style={{ borderColor: "var(--border)" }}>
  {(["github", "local"] as const).map((tab) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className="px-4 py-2 text-sm font-medium transition-colors"
      style={{
        color: activeTab === tab ? "var(--accent)" : "var(--muted)",
        borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
        marginBottom: "-1px",
        background: "transparent",
      }}
    >
      {tab === "github" ? "GitHub 分析" : "本地项目"}
    </button>
  ))}
</div>

{/* GitHub tab */}
{activeTab === "github" && (
  <div className="w-full">
    {/* Existing input + examples content — move here unchanged */}
  </div>
)}

{/* Local tab */}
{activeTab === "local" && (
  <div className="w-full">
    {/* Picker button — only shown if API is available */}
    {typeof window !== "undefined" &&
      typeof (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker === "function" && (
      <button
        onClick={handlePickerClick}
        className="mb-3 flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors"
        style={{
          borderColor: "var(--border)",
          background: "var(--panel)",
          color: "var(--text)",
        }}
      >
        <FolderOpen size={16} />
        选择文件夹
      </button>
    )}

    <div
      className="flex items-center gap-2 rounded-xl border px-4 py-3 transition-colors"
      style={{
        background: "var(--panel)",
        borderColor: localError ? "var(--error)" : "var(--border)",
      }}
    >
      <FolderOpen size={18} style={{ color: "var(--muted)", flexShrink: 0 }} />
      <input
        type="text"
        value={localPath}
        onChange={handleLocalPathChange}
        onKeyDown={(e) => { if (e.key === "Enter") handleLocalAnalyze(); }}
        placeholder="C:\Users\me\my-project  或  /home/me/my-project"
        className="flex-1 bg-transparent outline-none text-base"
        style={{ color: "var(--text)" }}
      />
      <button
        onClick={handleLocalAnalyze}
        className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors shrink-0"
        style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
      >
        Analyze
        <ArrowRight size={15} />
      </button>
    </div>

    {localError && (
      <p className="mt-2 text-sm text-left" style={{ color: "var(--error)" }}>
        {localError}
      </p>
    )}

    {localPickerMode === "client" && localPath && (
      <p className="mt-2 text-xs text-left" style={{ color: "var(--muted)" }}>
        已选择文件夹：{localPath}（将在浏览器中直接读取）
      </p>
    )}
  </div>
)}
```

**Note on `window.showDirectoryPicker` during SSR**: The picker button check uses `typeof window !== "undefined"` so it is only evaluated client-side. However, Next.js SSR may still cause a hydration mismatch. To avoid this, wrap the picker button in a `useEffect`-based `mounted` state check, or use a `dynamic` import. The simplest fix: add a `mounted` state that defaults to `false` and is set to `true` in a `useEffect`, then only render the picker button when `mounted === true`.

- [ ] **Step 7: Verify TypeScript and lint**

```bash
npx tsc --noEmit
npm run lint
```

Fix any errors.

- [ ] **Step 8: Manual test**

Start dev server. Visit `http://localhost:3000`.
- Verify both tabs render.
- GitHub tab: works as before.
- Local tab: text input is present; picker button appears (Chrome/Edge) or is hidden (Firefox/Safari).
- Typing a path and clicking Analyze navigates to `/analyze?source=local&path=...`.
- If picker was used: navigates to `/analyze?source=local&mode=client&name=...`.

- [ ] **Step 9: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add local project tab to homepage with folder picker and path input"
```

---

## Task 8: Update `app/analyze/page.tsx`

This is the largest task. The file is `"use client"` and about 1500 lines. Read it fully before making changes.

**Files:**
- Modify: `app/analyze/page.tsx`

### 8a: Read and understand the current file

- [ ] **Step 1: Read the full file**

Read `app/analyze/page.tsx` in full. Key sections to understand:
- `fetchTree` callback (~line 1121): calls `GET /api/github/tree?url=...`
- `fetchRepoFileContent` callback (~line 331): calls `GET /api/github/file?...`
- Inner `fetchContent` in `runRecursiveAnalysis` (~line 406): same call
- `resolveConfirmedEntryContext` (~line 876): same call
- `runEntryAnalysis` (~line 937): same call (inline)
- `handleFileClick` (~line 1263): same call
- `triggerSave` (~line 294): builds `AnalysisRecord`
- `useEffect` (~line 1238): reads `url` and `historyId` from `searchParams`
- Top bar JSX (~line 1316): renders `repoInfo.fullName`, stars, branch

### 8b: Add imports and read new query params

- [ ] **Step 2: Add new imports at the top of the file**

```typescript
import * as localFileStore from "@/lib/localFileStore";
import { buildLocalTree, readLocalFile } from "@/lib/localTreeBuilder";
import { FolderOpen } from "lucide-react";
import type { ProjectInfo } from "@/lib/datasource/index";
```

- [ ] **Step 3: Read source/mode/path/name from `searchParams`**

Inside `AnalyzeContent`, after `const searchParams = useSearchParams()`, add:

```typescript
const source = (searchParams.get("source") ?? "github") as "github" | "local";
const localMode = (searchParams.get("mode") ?? "server") as "server" | "client";
const localPath = searchParams.get("path") ?? "";
const localName = searchParams.get("name") ?? "";
```

- [ ] **Step 4: Add `projectInfo` state**

Add a state to hold `ProjectInfo` for local projects:

```typescript
const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
```

### 8c: Add client-mode handle expiry overlay

- [ ] **Step 5: Add handle expiry check**

First, add a `mounted` state to avoid SSR/hydration mismatch (`localFileStore.getHandle()` is always `null` on server, which would show the overlay during SSR even when a valid handle exists client-side):

```typescript
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);
```

Then, near the top of the JSX `return` statement (just inside `<div className="h-screen flex flex-col overflow-hidden">`), add:

```tsx
{/* Client-mode handle expiry overlay — only shown after client hydration */}
{mounted && source === "local" && localMode === "client" && !localFileStore.getHandle() && (
  <div
    className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4"
    style={{ background: "var(--bg)" }}
  >
    <p className="text-base" style={{ color: "var(--text)" }}>
      本地文件夹连接已断开。请返回首页重新选择文件夹。
    </p>
    <button
      onClick={() => router.push("/")}
      className="px-4 py-2 rounded-lg text-sm font-semibold"
      style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
    >
      返回首页
    </button>
  </div>
)}
```

### 8d: Create a unified `fetchFileContent` helper

The current code has 5 places that call `GET /api/github/file`. Replace them all with a single helper.

- [ ] **Step 6: Add `fetchFileContent` helper function**

Add this `useCallback` inside `AnalyzeContent`, before `fetchRepoFileContent`:

```typescript
const fetchFileContent = useCallback(async (
  filePath: string,
  sha?: string,
): Promise<string | null> => {
  if (source === "github") {
    // Existing GitHub logic
    if (!repoInfo) return null;
    const node = findNodeByPath(repoInfo.tree, filePath);
    if (!node || node.type !== "blob") return null;
    try {
      const params = new URLSearchParams({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        path: node.path,
        ...(node.sha ? { sha: node.sha } : {}),
      });
      const res = await fetch(`/api/github/file?${params}`);
      if (!res.ok) return null;
      const data = await res.json() as { content?: string };
      return data.content ?? null;
    } catch {
      return null;
    }
  } else if (localMode === "client") {
    const handle = localFileStore.getHandle();
    if (!handle) return null;
    try {
      return await readLocalFile(handle, filePath);
    } catch {
      return null;
    }
  } else {
    // server mode
    try {
      const params = new URLSearchParams({ root: localPath, file: filePath });
      const res = await fetch(`/api/local/file?${params}`);
      if (!res.ok) return null;
      const data = await res.json() as { content?: string };
      return data.content ?? null;
    } catch {
      return null;
    }
  }
}, [source, localMode, localPath, repoInfo]);
```

- [ ] **Step 7: Update `fetchRepoFileContent` to delegate**

**Important**: `fetchFileContent` (for `source=github`) reads `repoInfo` from closure. `fetchRepoFileContent` is called from `handleManualDrilldown` where `repoInfo` is already set. However, for the GitHub case, the `info` parameter passed to `fetchRepoFileContent` is always the same object as `repoInfo`. Keep the existing `findNodeByPath` logic on the passed-in `info` so the tree lookup always uses the authoritative `info`:

```typescript
const fetchRepoFileContent = useCallback(async (
  info: RepoInfo & { stars?: number },
  filePath: string,
): Promise<string | null> => {
  const node = findNodeByPath(info.tree, filePath);
  if (!node || node.type !== "blob") return null;

  if (source === "github") {
    // Use info directly (avoids relying on repoInfo state)
    try {
      const params = new URLSearchParams({
        owner: info.owner,
        repo: info.repo,
        path: node.path,
        ...(node.sha ? { sha: node.sha } : {}),
      });
      const res = await fetch(`/api/github/file?${params}`);
      if (!res.ok) return null;
      const data = await res.json() as { content?: string };
      return data.content ?? null;
    } catch { return null; }
  }

  // For local source, delegate to fetchFileContent
  return fetchFileContent(filePath, node.sha);
}, [fetchFileContent, source]);
```

This keeps GitHub mode using `info.owner/repo` directly (safe during in-flight analysis) while local mode delegates to `fetchFileContent`.

- [ ] **Step 8: Update `runEntryAnalysis` inline file fetch**

In `runEntryAnalysis`, find the inline `GET /api/github/file` fetch (inside the `for (const entry of entryFiles)` loop). Replace it with:

```typescript
// Before (remove this block):
const params = new URLSearchParams({
  owner: info.owner,
  repo: info.repo,
  path: node.path,
  sha: node.sha,
});
const res = await fetch(`/api/github/file?${params}`);
const data = await res.json();
if (!res.ok) {
  addLog(makeLogEntry("warning", `入口研判：${entry.path} 文件读取失败`));
  continue;
}
fileContent = (data as { content: string }).content;

// After (replace with):
const content = await fetchFileContent(entry.path, node.sha);
if (!content) {
  addLog(makeLogEntry("warning", `入口研判：${entry.path} 文件读取失败`));
  continue;
}
fileContent = content;
```

Also remove the now-unused `node` variable from the lookup above (or keep it — `findNodeByPath` is still used to check `node.type !== "blob"`).

- [ ] **Step 9: Update inner `fetchContent` in `runRecursiveAnalysis`**

In `runRecursiveAnalysis`, find the inner `fetchContent` function (async closure inside the callback). Replace it entirely:

```typescript
// Remove the inner fetchContent function definition.
// Instead, call the outer fetchFileContent directly:
async function fetchContent(filePath: string): Promise<string | null> {
  if (contentCache.has(filePath)) return contentCache.get(filePath)!;
  const result = await fetchFileContent(filePath);
  if (result !== null) contentCache.set(filePath, result);
  return result;
}
```

This inner wrapper still provides the caching behavior while delegating to the outer `fetchFileContent`.

Add `fetchFileContent` to the `runRecursiveAnalysis` dependency array.

- [ ] **Step 10: Update `resolveConfirmedEntryContext` file fetch**

In `resolveConfirmedEntryContext`, find the inline `GET /api/github/file` fetch. Replace it:

```typescript
// Before:
const params = new URLSearchParams({
  owner: repoInfo.owner, repo: repoInfo.repo, path: node.path, sha: node.sha,
});
const res = await fetch(`/api/github/file?${params}`);
const data = await res.json() as { content?: string; error?: string };
if (!res.ok || !data.content) return null;
const content = { path: confirmedPath, fileContent: data.content, info: repoInfo };

// After:
const fileContent = await fetchFileContent(confirmedPath, node.sha);
if (!fileContent) return null;
const content = { path: confirmedPath, fileContent, info: repoInfo };
```

Add `fetchFileContent` to the `resolveConfirmedEntryContext` dependency array.

- [ ] **Step 11: Update `handleFileClick`**

In `handleFileClick`, replace the `GET /api/github/file` fetch:

```typescript
// Before:
const params = new URLSearchParams({
  owner: repoInfo.owner, repo: repoInfo.repo, path: node.path, sha: node.sha,
});
const res = await fetch(`/api/github/file?${params}`);
const data = await res.json();
if (!res.ok) {
  setFileError((data as { error?: string }).error || text.fileLoadFailed);
  return;
}
setFileContent((data as { content: string }).content);

// After:
const content = await fetchFileContent(node.path, node.sha);
if (!content) {
  setFileError(text.fileLoadFailed);
  return;
}
setFileContent(content);
```

### 8e: Update `fetchTree` to handle local mode

- [ ] **Step 12: Update the `fetchTree` callback**

The current `fetchTree` takes a `url` string and calls `GET /api/github/tree`. Refactor it to handle both sources. Since `fetchTree` is called from `useEffect` and `handleAnalyze`, change its approach: the `useEffect` will call a new `initFromParams` function that dispatches appropriately.

Add a new `fetchLocalTree` callback:

```typescript
const fetchLocalTree = useCallback(async () => {
  setWorkflowState({ state: "working", stage: "tree" });
  setTreeLoading(true);
  setTreeError(null);
  setRepoInfo(null);
  setSelectedPath(null);
  setFileContent(null);
  setAnalysisResult(null);
  setAnalysisError(null);
  setAnalysisCache({});
  setEntryCheckResults({});
  setCheckingEntryPath(null);
  setCallgraphResult(null);
  setCallgraphDescriptionLocale("zh");
  setCallgraphLoading(false);
  setAnalyzingFunctions(new Set());
  setManualDrilldownPaths(new Set());
  setModuleAnalysis(null);
  setSelectedModuleId(null);
  drilldownCacheRef.current.clear();
  callgraphCacheRef.current = {};
  confirmedEntryContextRef.current = null;

  try {
    let tree, infoResult;

    if (localMode === "client") {
      const handle = localFileStore.getHandle();
      if (!handle) {
        setTreeError("本地文件夹连接已断开，请返回首页重新选择文件夹。");
        setWorkflowState({ state: "error", stage: "error" });
        return;
      }
      tree = await buildLocalTree(handle);
      infoResult = { name: handle.name, source: "local" as const };
    } else {
      const res = await fetch(`/api/local/tree?path=${encodeURIComponent(localPath)}`);
      const data = await res.json();
      if (!res.ok) {
        const msg = (data as { error?: string }).error || "无法读取本地目录";
        setTreeError(msg);
        setWorkflowState({ state: "error", stage: "error" });
        addLog(makeLogEntry("error", `本地目录获取失败：${msg}`));
        return;
      }
      tree = (data as { tree: TreeNode[] }).tree;
      infoResult = (data as { info: { name: string; source: "local" } }).info;
      // Also capture synthetic RepoInfo fields from the response
    }

    // Build synthetic RepoInfo for analyze page state
    const folderName = localMode === "client" ? localFileStore.getHandle()!.name : infoResult.name;
    const resolvedPath = localMode === "client" ? `local:${folderName}` : localPath;

    const info: RepoInfo & { stars?: number } = {
      owner: "",
      repo: folderName,
      branch: "",
      fullName: localMode === "client" ? resolvedPath : localPath,
      description: null,
      homepage: null,
      primaryLanguage: null,
      license: null,
      topics: [],
      stars: undefined,
      forks: undefined,
      openIssues: undefined,
      updatedAt: null,
      tree,
    };

    setProjectInfo(infoResult);
    analyzeUrlRef.current = resolvedPath;
    setRepoInfo(info);

    const { files, dirs } = countFiles(info.tree);
    setLogs([makeLogEntry("success", `本地项目：${folderName}`)]);
    addLog(makeLogEntry("success", `本地文件树加载完成：${files} 个文件，${dirs} 个目录`));

    fetchAnalysis(info, analysisLocaleRef.current);
  } catch {
    setTreeError("无法读取本地目录");
    setWorkflowState({ state: "error", stage: "error" });
    addLog(makeLogEntry("error", "本地目录读取失败：网络错误"));
  } finally {
    setTreeLoading(false);
  }
}, [addLog, fetchAnalysis, localMode, localPath]);
```

- [ ] **Step 13: Update the main `useEffect` to handle local source**

Find the `useEffect` that reads `url` and `historyId` from `searchParams`. Update it:

```typescript
useEffect(() => {
  const url = searchParams.get("url");
  const historyId = searchParams.get("historyId");

  if (historyId) {
    const record = getRecordById(historyId);
    if (record) { restoreFromRecord(record); return; }
  }

  if (source === "local") {
    fetchLocalTree();
    return;
  }

  if (url) {
    setInputUrl(url);
    fetchTree(url);
  }
}, [fetchTree, fetchLocalTree, searchParams, restoreFromRecord, source]);
```

### 8f: Update `triggerSave` for local records

- [ ] **Step 14: Update `triggerSave` to include `source` and `displayName`**

In `triggerSave`, after `saveRecord(record)`, ensure the record includes the new fields. Find the `record` object construction and add:

```typescript
const record: AnalysisRecord = {
  id: String(Date.now()),
  analyzedAt: new Date().toISOString(),
  url: analyzeUrlRef.current,
  source: source === "local" ? "local" : undefined,  // NEW
  displayName: source === "local" ? (info.repo || info.fullName) : undefined,  // NEW (folder name)
  repoMeta: {
    owner: info.owner,
    repo: info.repo,
    branch: info.branch,
    fullName: info.fullName,
    description: info.description,
    // ... rest unchanged
  },
  // ... rest unchanged
};
```

### 8g: Update the top bar for local source

- [ ] **Step 15: Update the top bar JSX**

Find the `{repoInfo && (...)}` block in the `<header>` JSX (around line 1331). Add a branch for local source:

```tsx
{repoInfo && (
  <>
    <span style={{ color: "var(--border)" }}>/</span>
    <span className="text-sm font-medium truncate max-w-xs" style={{ color: "var(--text)" }}>
      {repoInfo.fullName}
    </span>
    {/* GitHub-only metadata */}
    {source === "github" && (
      <>
        {repoInfo.stars !== undefined && (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border"
            style={{ color: "var(--muted)", borderColor: "var(--border)" }}>
            <Star size={11} />
            {repoInfo.stars.toLocaleString()}
          </span>
        )}
        <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border"
          style={{ color: "var(--muted)", borderColor: "var(--border)" }}>
          <GitBranch size={11} />
          {repoInfo.branch}
        </span>
      </>
    )}
    {/* Local-only indicator */}
    {source === "local" && (
      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border"
        style={{ color: "var(--muted)", borderColor: "var(--border)" }}>
        <FolderOpen size={11} />
        本地项目
      </span>
    )}
    {/* Re-analyze and Export buttons — unchanged */}
    {isRestoredFromHistory && ( /* ... unchanged */ )}
    {currentRecordId !== null && ( /* ... unchanged */ )}
  </>
)}
```

### 8h: Final verification

- [ ] **Step 16: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: the `TreeNode.sha` optional change from Task 1 may have left errors in callsites within this file. Fix each one:
- In `fetchRepoFileContent`: already handled (passes `node.sha` only if defined via `...(node.sha ? { sha: node.sha } : {})`)
- In `fetchFileContent`: same pattern
- In `handleFileClick`: `node.sha` passed to `fetchFileContent` — fine since `sha?: string`
- `resolveConfirmedEntryContext`: `node.sha` passed to `fetchFileContent` — fine

- [ ] **Step 17: Build check**

```bash
npm run build
```

Expected: successful build with no TypeScript errors. Warnings about unused variables are acceptable; errors are not.

- [ ] **Step 18: End-to-end manual test — GitHub mode**

1. Start dev server: `npm run dev`
2. Open `http://localhost:3000`
3. Use GitHub tab with a repo URL — verify analysis works as before
4. Check history card shows as before

- [ ] **Step 19: End-to-end manual test — Local server mode**

1. Use Local tab, type a path to a local project directory
2. Click Analyze
3. Verify file tree loads in the FileTree panel
4. Click a file — verify contents appear in CodePanel
5. Verify AI analysis runs (AnalysisPanel populates)
6. If entry file found, verify call graph appears in PanoramaPanel
7. Verify history card shows with folder icon and local path

- [ ] **Step 20: End-to-end manual test — Local client mode (Chrome/Edge only)**

1. Click "选择文件夹" in the Local tab
2. Pick a directory from the OS picker
3. Click Analyze
4. Verify same behavior as server mode (files visible, AI runs, etc.)
5. Refresh the page — verify handle expiry overlay appears with "返回首页" button

- [ ] **Step 21: Lint**

```bash
npm run lint
```

Fix any lint errors.

- [ ] **Step 22: Commit**

```bash
git add app/analyze/page.tsx
git commit -m "feat: add local source support to analyze page (server + client mode)"
```

---

## Task 9 (Optional): Extract `lib/datasource/github.ts`

This task extracts the GitHub-specific logic from the two existing route files into a class. It does not change any behavior — it is a code quality improvement.

**Files:**
- Create: `lib/datasource/github.ts`
- Optionally modify: `app/api/github/tree/route.ts`, `app/api/github/file/route.ts`

**Note**: `GitHubDataSource.getFile` takes a `sha` (blob hash) rather than a path, because GitHub's blob API requires the SHA. This means `GitHubDataSource` does not formally implement the `DataSource` interface (which uses `getFile(path)`). This class is a standalone extraction for code reuse — it does not need to implement the interface in this iteration.

- [ ] **Step 1: Create `GitHubDataSource`**

```typescript
// lib/datasource/github.ts
import { buildTree } from "@/lib/github";
import type { ProjectInfo } from "@/lib/datasource/index";
import type { TreeNode } from "@/lib/github";

function getGithubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Panocode/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

export class GitHubDataSource {
  constructor(private owner: string, private repo: string) {}

  async getTree(): Promise<{ info: ProjectInfo; tree: TreeNode[] }> {
    const headers = getGithubHeaders();
    const repoRes = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}`, { headers });
    if (!repoRes.ok) throw new Error(`GitHub API ${repoRes.status}`);
    const repoData = await repoRes.json() as { default_branch: string; full_name: string; description: string | null };
    const branch = repoData.default_branch;

    const treeRes = await fetch(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/trees/${branch}?recursive=1`,
      { headers }
    );
    if (!treeRes.ok) throw new Error(`GitHub tree API ${treeRes.status}`);
    const treeData = await treeRes.json() as { tree: Parameters<typeof buildTree>[0] };
    const tree = buildTree(treeData.tree ?? []);

    const info: ProjectInfo = {
      name: repoData.full_name,
      source: "github",
      owner: this.owner,
      repo: this.repo,
      branch,
      description: repoData.description,
    };

    return { info, tree };
  }

  async getFile(sha: string): Promise<string> {
    const headers = getGithubHeaders();
    const res = await fetch(
      `https://api.github.com/repos/${this.owner}/${this.repo}/git/blobs/${sha}`,
      { headers }
    );
    if (!res.ok) throw new Error(`GitHub blob API ${res.status}`);
    const data = await res.json() as { content?: string; encoding?: string };
    if (!data.content) throw new Error("Empty blob content");
    const normalized = data.content.replace(/\n/g, "");
    return data.encoding === "base64"
      ? Buffer.from(normalized, "base64").toString("utf8")
      : normalized;
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/datasource/github.ts
git commit -m "feat: extract GitHubDataSource class (optional refactor)"
```

---

## Summary Commit Order

```
refactor: make TreeNode.sha optional for local filesystem support
feat: add DataSource interface and ProjectInfo type
feat: add LocalDataSource for server-side filesystem access
feat: add GET /api/local/tree route for local filesystem
feat: add GET /api/local/file route with path traversal guard
feat: add storage source/displayName fields, localFileStore, localTreeBuilder
feat: add local project tab to homepage with folder picker and path input
feat: add local source support to analyze page (server + client mode)
feat: extract GitHubDataSource class (optional refactor)
```
