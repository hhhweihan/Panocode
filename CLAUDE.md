# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (Turbopack)
npm run build    # Production build
npm run lint     # ESLint check
```

## Environment Setup

Copy `.env.local.example` to `.env.local` and fill in:

```
LLM_API_KEY      # AI API key (Aliyun DashScope, Google AI Studio, etc.)
LLM_BASE_URL     # OpenAI-compatible endpoint
LLM_MODEL        # Model name (e.g. qwen-plus, gemini-2.0-flash)
GITHUB_TOKEN     # Optional: GitHub PAT for higher rate limits and GitHub Models
GITHUB_USE_MODELS=true  # Optional: use GitHub Models for entry analysis
NEXT_PUBLIC_CALLGRAPH_MAX_DEPTH=2  # Optional: recursion depth (default 2)
NEXT_PUBLIC_CALLGRAPH_KEY_CHILDREN_LIMIT=10  # Optional: key child call limit (default 10)
```

## Architecture

**Panocode** is a Next.js app that lets users explore any public GitHub repo with AI-powered analysis and function call graph visualization.

### Analysis Pipeline (triggered from `app/analyze/page.tsx`)

1. **Repo tree** — `GET /api/github/tree` fetches the full file tree from GitHub
2. **AI analysis** — `POST /api/analyze` identifies languages, tech stack, and candidate entry files using the configured LLM
3. **Entry verification** — `POST /api/analyze/entry` sequentially validates candidates until one is confirmed as a real entry point
4. **Call graph** — `POST /api/analyze/callgraph` generates the top-level function call tree for the confirmed entry file
5. **Recursive expansion** — `POST /api/analyze/callgraph/expand` deepens the tree level by level (up to `CALLGRAPH_MAX_DEPTH`)
6. **Function location** — `POST /api/analyze/callgraph/locate` asks the AI which file likely contains a given function

### Key Files

| File | Role |
|------|------|
| `app/analyze/page.tsx` | Main orchestrator — state management, panel layout, analysis pipeline |
| `components/PanoramaPanel.tsx` | Call graph tree renderer with pan/zoom and drill-down indicators |
| `components/AnalysisPanel.tsx` | Displays AI results: languages, tech stack, entry file status |
| `components/FileTree.tsx` | Interactive collapsible repo file browser |
| `components/CodePanel.tsx` | Syntax-highlighted code viewer |
| `components/LogPanel.tsx` | Dockable activity log panel |
| `lib/github.ts` | GitHub API helpers and shared TypeScript types |
| `lib/codeFilter.ts` | Filters code files from repo tree |
| `lib/callgraphUtils.ts` | Call graph tree utilities |

### LLM Integration

All LLM calls use the OpenAI-compatible chat completions API (`lib/` helpers + direct `fetch`). The app supports any provider exposing that interface — default config targets Aliyun DashScope (`qwen-plus`). Entry analysis can optionally route to GitHub Models via `GITHUB_USE_MODELS=true`.

### UI Layout

Five-panel layout in `app/analyze/page.tsx`: **FileTree | CodePanel | AnalysisPanel | PanoramaPanel**, with a floating/dockable **LogPanel**. Panels have drag-resizable dividers. The UI is bilingual (Chinese/English) with a locale switcher.

### Path Alias

`@/*` maps to the project root (e.g. `import { ... } from '@/lib/github'`).
