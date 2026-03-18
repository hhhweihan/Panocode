# Local Code Analysis — Design Spec

**Date**: 2026-03-19
**Status**: Approved
**Scope**: Add local-filesystem project analysis alongside existing GitHub analysis.

---

## 1. Goals

1. Add a "本地项目" tab to the homepage alongside the existing "GitHub 分析" tab.
2. Let users select a local directory (text input or OS folder picker) and run the same AI-powered analysis pipeline on it.
3. Introduce a `DataSource` abstraction that cleanly separates file-fetching from AI analysis, with `GitHubDataSource` and `LocalDataSource` implementations.
4. Keep the five-panel analyze UI (`FileTree | CodePanel | AnalysisPanel | PanoramaPanel + LogPanel`) unchanged.

---

## 2. Architecture Overview

```
Homepage (tab)
  ├── GitHub tab  → /analyze?source=github&url=<repoUrl>
  └── Local tab   → /analyze?source=local&path=<absPath>          (text input → server mode)
                  → /analyze?source=local&mode=client&name=<name> (folder picker → client mode)

Analyze page (orchestrator — Client Component)
  ├── source=github  → GET /api/github/tree  +  GET /api/github/file
  └── source=local
        ├── mode=server → GET /api/local/tree  +  GET /api/local/file  (Node.js fs on server)
        └── mode=client → localFileStore.ts (FileSystemDirectoryHandle, browser-only)
  └── all paths → POST /api/analyze/*  (unchanged, source-agnostic)
```

**Important**: `app/analyze/page.tsx` is already a `"use client"` component. `lib/localFileStore.ts` is a client-only module and must never be imported by any Server Component or API route. `FileSystemDirectoryHandle` is a browser API.

---

## 3. DataSource Abstraction

### 3.1 `TreeNode` — `sha` made optional

In `lib/github.ts`, change `sha: string` → `sha?: string`. All existing callers use `sha` only when `source=github` (passed to `/api/github/file`). Audit required: search for `.sha` usage; any callsite that relies on it must guard with `if (node.sha)`. Local nodes omit `sha` entirely.

### 3.2 Interface — `lib/datasource/index.ts`

```typescript
// TreeNode is imported from lib/github.ts (no move needed)
import type { TreeNode } from '@/lib/github';

export interface ProjectInfo {
  name: string;                     // repo name or folder name
  source: 'github' | 'local';
  description?: string | null;
  // GitHub-only (undefined in local mode)
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

// Populated fields for local source: name, source only.
// All GitHub-only fields are undefined for local projects.

export interface DataSource {
  getTree(): Promise<{ info: ProjectInfo; tree: TreeNode[] }>;
  getFile(path: string): Promise<string>;
}
```

`lib/datasource/index.ts` imports `TreeNode` from `lib/github.ts`. No type migration needed.

### 3.3 `lib/datasource/github.ts` — `GitHubDataSource`

Extracts the GitHub fetch logic currently duplicated in the two route files. The existing `/api/github/tree/route.ts` and `/api/github/file/route.ts` routes are **optionally** refactored to delegate to this class (low-risk, keeps public API unchanged). This refactor is included in the implementation plan but does not block the local feature.

### 3.4 `lib/datasource/local.ts` — `LocalDataSource` (server-side only)

```typescript
import fs from 'fs';
import path from 'path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  'out', 'coverage', '.cache', '__pycache__', '.venv', 'vendor',
]);

export class LocalDataSource {
  constructor(private root: string) {}

  getTree(): { info: ProjectInfo; tree: TreeNode[] }
  getFile(relativePath: string): string  // throws on path traversal or read error
}
```

- `getTree()`: recursively walks `root` using `fs.readdirSync`. Skips symlinks (`lstat` check) and any entry whose name is in `SKIP_DIRS`. Returns `TreeNode[]` with `sha` omitted. The `info` object contains `{ name: path.basename(root), source: 'local' }`.
- `getFile(relativePath)`: resolves `path.resolve(root, relativePath)`. Guard: the resolved path must satisfy `resolvedPath === resolvedRoot || resolvedPath.startsWith(resolvedRoot + path.sep)` — this prevents prefix-collision attacks (e.g., root `/tmp/proj` vs path `/tmp/project-evil/file`). Throws `403` if guard fails. Reads with `fs.readFileSync(resolvedPath, 'utf8')`. For binary files (detected by null-byte presence in first 8 KB), returns empty string `""`.

Binary detection:
```typescript
const buf = fs.readFileSync(resolvedPath);
const sample = buf.slice(0, 8192);
if (sample.includes(0)) return '';
return buf.toString('utf8');
```

---

## 4. New API Routes

### `GET /api/local/tree?path=<absolute_path>`

- Instantiates `LocalDataSource(path)`, calls `getTree()`
- Returns `{ info: ProjectInfo, tree: TreeNode[] }` — same shape as `/api/github/tree`
- Error cases:
  - `path` param missing → 400
  - Path does not exist or is not a directory → 404
  - Any `fs` error → 500

### `GET /api/local/file?root=<absolute_path>&file=<relative_path>`

- Instantiates `LocalDataSource(root)`, calls `getFile(file)`
- Returns `{ content: string }` — same shape as `/api/github/file`
- Path traversal → 403
- File not found → 404

---

## 5. Client-Side File Store — `lib/localFileStore.ts`

**This is a client-only module.** It must only be imported in `"use client"` components.

```typescript
// lib/localFileStore.ts
// "use client" import only — never import in server code

let _handle: FileSystemDirectoryHandle | null = null;

export function setHandle(h: FileSystemDirectoryHandle): void { _handle = h; }
export function getHandle(): FileSystemDirectoryHandle | null { return _handle; }
export function clearHandle(): void { _handle = null; }
```

Module-level state persists within a single browser page session (no navigation refresh). If the user refreshes, the handle is gone — see Section 9 (edge cases).

### Client-mode tree enumeration — `lib/localTreeBuilder.ts`

A client-side-only utility that builds `TreeNode[]` from a `FileSystemDirectoryHandle`:

```typescript
// lib/localTreeBuilder.ts
async function buildLocalTree(
  dirHandle: FileSystemDirectoryHandle,
  relativePath = ''
): Promise<TreeNode[]>
```

- Recursively calls `dirHandle.values()` (async iterator of `FileSystemHandle`)
- Skips entries whose name is in `SKIP_DIRS` (same set as server-side)
- For files: creates `TreeNode { name, path: relativePath/name, type: 'blob' }`
- For directories: creates `TreeNode { name, path, type: 'tree', children: [...] }`
- Returns sorted result (directories first, then files alphabetically)

### Client-mode file reading

```typescript
async function readLocalFile(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<string>
```

- Splits `relativePath` by `/`, traverses directory handles, then calls `.getFile().text()`
- Throws if any handle is not found

---

## 6. Homepage Changes — `app/page.tsx`

### Tab bar

Two tabs: `"GitHub 分析"` and `"本地项目"`. Active tab indicated by `var(--accent)` underline. Tab state is `useState<'github' | 'local'>('github')`, not persisted.

### GitHub tab

Identical to current content — no changes.

### Local tab

```
[ 📁 选择文件夹 ]   ← only shown if File System Access API is available
                     (typeof window.showDirectoryPicker === 'function')

┌───────────────────────────────────────────────┐
│ /Users/me/my-project                          │  ← text input, always shown
└───────────────────────────────────────────────┘
                                    [ Analyze → ]
```

- **"选择文件夹" button**: shown only if `typeof window.showDirectoryPicker === 'function'`. On click:
  1. Calls `showDirectoryPicker()`
  2. On success: calls `localFileStore.setHandle(handle)`, sets input value to `handle.name` (display only — not a full path), sets `pickerMode = 'client'`
  3. On failure (user cancels or browser error): no-op
- **Text input**: always shown. User types an absolute path. On change: clears any stored handle, sets `pickerMode = 'server'`
- **Analyze button**:
  - `pickerMode = 'client'`: navigates to `/analyze?source=local&mode=client&name=<handle.name>`
  - `pickerMode = 'server'` (or no picker used): validates input is non-empty, navigates to `/analyze?source=local&path=<encoded_absolute_path>`

### History cards

`HistoryCard` gains a `source?: 'github' | 'local'` prop. When `source=local`, show a folder icon (`FolderOpen` from lucide-react) instead of the GitHub URL display.

---

## 7. Analyze Page Changes — `app/analyze/page.tsx`

### New query params

| Param | Used when | Meaning |
|-------|-----------|---------|
| `source` | always | `'github'` (default for backward compat) \| `'local'` |
| `path` | `source=local, mode=server` | Absolute local path |
| `mode` | `source=local` | `'server'` (default) \| `'client'` |
| `name` | `source=local, mode=client` | Folder display name |
| `url` | `source=github` | Existing GitHub URL param |

Existing `?url=...` links continue to work unchanged (`source` defaults to `'github'`).

### `fetchFileContent` helper

Replaces ad-hoc file fetch calls in the orchestrator. Lives inside the component (or a co-located utility). Type: `(path: string, sha?: string) => Promise<string>`.

```typescript
async function fetchFileContent(filePath: string, sha?: string): Promise<string> {
  if (source === 'github') {
    // existing: GET /api/github/file?owner=...&repo=...&path=...&sha=...
  } else if (mode === 'client') {
    const handle = localFileStore.getHandle();
    if (!handle) throw new Error('Folder handle not available — please re-select the folder');
    return readLocalFile(handle, filePath);
  } else {
    // GET /api/local/file?root=<localPath>&file=<filePath>
  }
}
```

### `fetchTree` helper

```typescript
async function fetchTree(): Promise<{ info: ProjectInfo; tree: TreeNode[] }> {
  if (source === 'github') {
    // existing: GET /api/github/tree?url=...
  } else if (mode === 'client') {
    const handle = localFileStore.getHandle();
    if (!handle) throw new Error('...');
    const tree = await buildLocalTree(handle);
    return { info: { name: handle.name, source: 'local' }, tree };
  } else {
    // GET /api/local/tree?path=<localPath>
  }
}
```

### Top bar

- `source=github`: existing repo info bar (stars, forks, branch, description)
- `source=local`: folder name + truncated absolute path (or folder name only for client mode); no GitHub metadata fields

### Client-mode handle expiry (UX flow)

If `mode=client` and `localFileStore.getHandle()` returns `null` (user refreshed), show an error overlay over the analyze page:

> "本地文件夹连接已断开。请返回首页重新选择文件夹。"

With a "返回首页" button. Do not attempt to proceed with analysis.

### AI analysis pipeline

No changes. Remains source-agnostic.

---

## 8. Storage Changes — `lib/storage.ts`

### `AnalysisRecord` additions

```typescript
interface AnalysisRecord {
  // all existing fields unchanged
  id: string;
  url: string;          // GitHub URL or absolute local path
  analyzedAt: string;
  repoMeta: {
    owner: string;      // '' for local source
    repo: string;       // folder name for local source
    branch: string;     // '' for local source
    fullName: string;   // absolute path for local source (used for deduplication)
    description: string | null;
    // ... other optional fields unchanged
  };
  // new optional fields (absent on existing records = backward compat)
  source?: 'github' | 'local';   // absent → treated as 'github'
  displayName?: string;          // folder name for local source; used in buildSummary
}
```

- For local records: `repoMeta.fullName` = absolute path (ensures correct deduplication per unique path). `repoMeta.owner = ''`, `repoMeta.repo = folderName`, `repoMeta.branch = ''`.
- `buildSummary` changes:
  - `repoName: record.displayName ?? record.repoMeta.fullName` — local records show folder name, GitHub records show `owner/repo` (unchanged because `displayName` is absent on GitHub records).
  - Add `source: record.source` to the returned `AnalysisRecordSummary` so `HistoryCard` can read it.
- `AnalysisRecordSummary` gains `source?: 'github' | 'local'`.
- `HistoryCard` reads `summary.source ?? 'github'` to select folder icon vs GitHub URL display.
- `HistoryCard` click navigation for local records: navigates to `/analyze?source=local&path=<encodeURIComponent(summary.url)>` (server mode, `summary.url` = absolute path). Client-mode records (`summary.url = "local:<name>"`) cannot be re-opened from history; show a tooltip "本地文件夹模式不支持从历史记录重新打开，请重新选择文件夹" and disable the click. In practice, implementors may skip client-mode history entirely in the first pass and only support server-mode history.
- `saveRecord` deduplication (`r.repoMeta.fullName !== record.repoMeta.fullName`) continues to work correctly because local records use absolute path as `fullName`.
- GitHub records do **not** populate `displayName` — the field is local-only.
- **`displayName` write path**: when the analyze page calls `saveRecord`, it sets `record.displayName = path.basename(localPath)` (server mode) or `record.displayName = folderName` from `info.name` (client mode). This value comes from the `info.name` field returned by `fetchTree()`.

### RepoInfo state in analyze page

`app/analyze/page.tsx` holds `repoInfo` state typed as `RepoInfo & { stars?: number }`. To avoid widening this type (which would cascade changes across all callsites), the `/api/local/tree` route returns a **synthetic `RepoInfo`** compatible object alongside the tree:

```typescript
// Response shape of GET /api/local/tree
{
  info: ProjectInfo,            // { name: folderName, source: 'local' }
  tree: TreeNode[],
  // synthetic RepoInfo fields for analyze page state compatibility
  owner: '',
  repo: folderName,
  branch: '',
  fullName: absolutePath,       // used as display name and dedup key
  description: null,
  homepage: null,
  primaryLanguage: null,
  license: null,
  topics: [],
  stars: undefined,
  forks: undefined,
  openIssues: undefined,
  updatedAt: null,
}
```

The analyze page uses `info.source` to decide rendering (top bar, icon) and feature availability, while the existing `RepoInfo`-typed state and all downstream callsites remain unchanged.

---

## 9. Files Changed / Created

| Action | File |
|--------|------|
| Create | `lib/datasource/index.ts` |
| Create | `lib/datasource/github.ts` |
| Create | `lib/datasource/local.ts` |
| Create | `lib/localFileStore.ts` |
| Create | `lib/localTreeBuilder.ts` |
| Create | `app/api/local/tree/route.ts` |
| Create | `app/api/local/file/route.ts` |
| Modify | `lib/github.ts` — `TreeNode.sha?: string` |
| Modify | `app/page.tsx` — add tab UI |
| Modify | `app/analyze/page.tsx` — source/mode handling, fetchTree/fetchFileContent |
| Modify | `lib/storage.ts` — add optional `source` to `AnalysisRecord` |
| Optionally refactor | `app/api/github/tree/route.ts` — delegate to `GitHubDataSource` |
| Optionally refactor | `app/api/github/file/route.ts` — delegate to `GitHubDataSource` |

---

## 10. Security & Edge Cases

- **Path traversal**: `/api/local/file` uses `resolvedPath.startsWith(resolvedRoot + path.sep) || resolvedPath === resolvedRoot` to prevent both traversal and prefix-collision attacks.
- **Symlinks**: `lstatSync` used during tree walk; symlinks skipped entirely.
- **Binary files**: null-byte scan on first 8 KB; returns `""` if binary.
- **Large repos**: AI analysis prompt capped at 500 file paths (same as GitHub mode). Tree display is not capped — all files shown in FileTree.
- **File System Access API unavailability**: "选择文件夹" button hidden when `typeof window.showDirectoryPicker !== 'function'` (e.g., Firefox, Safari). Text input always available.
- **Client-mode handle expiry**: If user refreshes with `mode=client`, `localFileStore.getHandle()` returns `null`. Analyze page shows an error overlay with a "返回首页" button instead of attempting analysis.
- **`TreeNode.sha` callsite audit**: All code that accesses `node.sha` must guard with `if (node.sha)` or only run when `source=github`. Specifically: (a) the `GET /api/github/file` call in the orchestrator passes `sha` as a param and must check `sha` is defined; (b) `resolveConfirmedEntryContext` (analyze page) also passes `sha: node.sha` to the file API — same guard required.
- **`TreeItem.sha`**: `TreeItem` in `lib/github.ts` retains `sha: string` (non-optional). `buildTree()` is only called by the GitHub route, not by local code. No change needed there.

---

## 11. Out of Scope

- Watching local files for changes (no live reload of analysis).
- Grep-style file content search.
- Remote/SSH paths or network drives.
- Persisting `FileSystemDirectoryHandle` across page refreshes (IndexedDB storage of handles).
