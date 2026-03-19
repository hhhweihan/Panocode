# Panocode

[中文说明](README.md)

AI workspace for understanding GitHub repositories and local codebases through structure analysis, entry detection, call graph visualization, and module grouping.

Panocode is an AI-powered tool for codebase understanding and demonstration. It can read either a public GitHub repository or a local project, automatically identify project structure, candidate entry files, key call chains, and functional modules, then present the results in a visual workspace so you can build a high-level mental model of the codebase quickly.

## Good Fit Scenarios

- Quickly understand the overall structure of an unfamiliar repository
- Do technical research before extending or integrating a project
- Demonstrate project entry points and key execution paths to teammates
- Browse large repositories with AI-assisted function-level exploration
- Export structured analysis results for documentation or follow-up automation

## Core Features

- Analyze public GitHub repositories
- Analyze local projects
- Detect language distribution, tech stack, and candidate entry files
- Re-evaluate candidate entry files to reduce false positives
- Generate a panoramic call graph from the entry function and expand it recursively
- Group functions by functional module and color-code them
- Browse the file tree, inspect source code, and review workflow logs
- Export Markdown reports and JSON analysis results
- Configure AI provider, model, and analysis depth at runtime

## Preview

- Home page screenshot highlighting product positioning, dual entry options, and value proposition
- Analysis workspace screenshot showing the file tree, source code, repository insights, and call panorama
- A public demo URL can be added here later if one becomes available

Current placeholders:

```text
[TODO] Home page screenshot
[TODO] Analysis page screenshot
[TODO] Public demo URL
```

## Workflow

Panocode follows this general analysis flow:

1. Load repository information and file tree
2. Identify project languages, tech stack, and candidate entry files
3. Validate candidate entry files one by one
4. Generate the top-level call graph from the confirmed entry
5. Recursively expand key call nodes
6. Group analyzed functions into modules
7. Save the result as JSON or export it as Markdown

## Interface Overview

The main workspace is composed of these areas:

- FileTree: browse the repository directory structure
- CodePanel: inspect source code with highlighting
- AnalysisPanel: review AI-generated summaries, entry-point decisions, and tech stack insights
- PanoramaPanel: inspect the call graph, recursive expansion results, and module coloring
- LogPanel: follow workflow states, errors, and AI analysis logs

## Getting Started

### Requirements

- Node.js 20 or higher
- npm 10 or higher
- An available OpenAI-compatible API provider, or optional GitHub Models credentials

### Install Dependencies

```bash
npm install
```

### Configure Environment Variables

Copy the example configuration first:

```bash
cp .env.local.example .env.local
```

On Windows PowerShell, you can also run:

```powershell
Copy-Item .env.local.example .env.local
```

Then configure at least these variables:

```dotenv
LLM_API_KEY="your-dashscope-api-key"
LLM_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
LLM_MODEL="qwen-plus"
```

Optional variables:

```dotenv
GITHUB_TOKEN="your-github-token"
GITHUB_USE_MODELS="true"
NEXT_PUBLIC_CALLGRAPH_MAX_DEPTH="2"
NEXT_PUBLIC_CALLGRAPH_KEY_CHILDREN_LIMIT="10"
```

Notes:

- The project uses an OpenAI-compatible Chat Completions API by default
- You can replace the provider with DashScope, Google AI Studio compatible layers, or other compatible services
- If GitHub Models is enabled, GITHUB_TOKEN can be used as a supplemental capability for entry verification and related steps
- Runtime settings in the top-right settings panel are persisted in browser local storage
- If both environment variables and browser settings are present, environment variables take precedence at startup

### Start the Development Server

```bash
npm run dev
```

Default URL:

- http://localhost:3000

### Production Build

```bash
npm run build
npm run start
```

### Lint

```bash
npm run lint
```

## Usage

### Analyze a GitHub Repository

1. Choose GitHub analysis on the home page
2. Enter a repository URL, for example https://github.com/microsoft/vscode
3. Click Analyze
4. Wait for the file tree, project analysis, entry verification, and call graph generation to finish

### Analyze a Local Project

1. Switch to Local Project on the home page
2. Enter a local path directly, or choose a folder in browsers that support the File System Access API
3. Click Analyze
4. Open the analysis workspace and inspect the tree, source code, and call graph results

## Output Files

After call graph analysis finishes, the project generates:

```text
analysis-output/<repo-name>.callgraph.json
```

After module analysis finishes, the project generates:

```text
analysis-output/<repo-name>.module-analysis.json
```

These results usually include:

- Repository name and source URL
- Project summary and description
- Confirmed entry file
- Current call graph tree
- Language distribution and tech stack
- Module list and function ownership

## Project Structure

```text
app/                 Next.js App Router pages and API routes
components/          Workspace panels and interaction components
lib/                 Core logic for GitHub, LLM, call graph, and storage
public/              Static assets
docs/                Design documents and planning notes
```

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Lucide React
- Zod

## Current Limitations

- Call graph and module analysis depend on LLM output and are not strict static-analysis results
- Entry detection may be inaccurate for very large repositories, dynamic languages, or highly reflective frameworks
- GitHub analysis is primarily aimed at public repositories; additional credentials may be required for rate limits or model access
- Local project analysis depends on browser capabilities or local path access, so behavior may vary by environment

## Development Notes

- The main entry pages are [app/page.tsx](app/page.tsx) and [app/analyze/page.tsx](app/analyze/page.tsx)
- Runtime settings logic lives in [lib/runtimeSettings.ts](lib/runtimeSettings.ts)
- LLM integration is implemented in [lib/llm.ts](lib/llm.ts)
- Call graph logic mainly lives in [lib/callgraphBridge.ts](lib/callgraphBridge.ts) and [lib/callgraphUtils.ts](lib/callgraphUtils.ts)

## FAQ

### 1. Why can the app start but fail to analyze a repository?

The most common cause is missing or invalid AI provider configuration. Check LLM_API_KEY, LLM_BASE_URL, and LLM_MODEL in .env.local first.

### 2. Why is entry-file recognition sometimes inaccurate?

Entry detection is AI-assisted inference rather than compiler-level exact parsing. Multi-entry projects, scaffold-heavy projects, and highly dynamic code structures may still require manual review.

### 3. Why can I not choose a local folder directly in the browser?

Folder selection depends on the File System Access API, which is not fully supported in every browser. You can also enter a local path directly and use the server-side path mode.

## English Version

This file is the English documentation. The Chinese version is available in [README.md](README.md).
