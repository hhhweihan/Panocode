# Panocode

[中文说明](README.md)

An AI-powered workspace for understanding GitHub repositories and local codebases through entry analysis, call graph visualization, and module mapping.

Panocode is an AI-powered repository analysis workspace for understanding codebases. It can inspect GitHub repositories or local projects, identify likely entry points, generate a high-level call graph, group functions into modules, and present the results in a visual, explorable interface.

## Recommended GitHub Repository Metadata

Suggested repository description:

```text
AI-powered workspace for understanding GitHub repositories and local codebases through entry analysis, call graph visualization, and module mapping.
```

Suggested short tagline:

```text
Understand a codebase faster.
```

Suggested topics:

```text
ai code-analysis code-visualization call-graph repository-analysis github nextjs react typescript developer-tools
```

## What This Project Is

Panocode is best described as a codebase understanding tool.

It is designed to answer questions such as:

- What does this repository do?
- Where does execution start?
- What are the key call paths?
- Which modules or functions should I read first?
- Can I keep the analysis output for documentation or follow-up work?

This is not a traditional static analyzer, and it is not a general-purpose chat UI. Its focus is repository comprehension and architecture discovery.

## Core Features

- Analyze public GitHub repositories
- Analyze local projects
- Detect languages, tech stack, and candidate entry files
- Re-check candidate entry files to reduce false positives
- Generate a recursive call graph from the confirmed entry point
- Group analyzed functions into functional modules
- Browse file tree and source code side by side
- Inspect workflow progress in the log panel
- Export Markdown and persist JSON analysis artifacts

## Preview

Once the project is deployed, this section should be updated with real screenshots. For most visitors, screenshots are the fastest way to decide whether the product is worth trying.

Recommended additions:

- Home page hero screenshot
- Analysis workspace screenshot showing tree, code, insights, and call graph
- Public demo URL when available

Current placeholders:

```text
[TODO] Home page screenshot
[TODO] Analysis workspace screenshot
[TODO] Public demo URL
```

## What To Update After Deployment

After deployment, these repository-facing assets are worth updating:

- Add a live demo link near the top of the README
- Add the public site or demo URL to the GitHub About section
- Replace placeholder screenshots with real UI captures
- Add a changelog or roadmap once releases start evolving

## Workflow

1. Load repository metadata and file tree
2. Analyze languages, tech stack, and candidate entry files
3. Verify candidate entry files one by one
4. Build the top-level call graph from the confirmed entry
5. Expand key nodes recursively
6. Group analyzed functions into modules
7. Export or save the results

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Lucide React
- Zod

## Getting Started

### Requirements

- Node.js 20+
- npm 10+
- An OpenAI-compatible API provider, or optional GitHub Models credentials

### Install Dependencies

```bash
npm install
```

### Configure Environment Variables

Copy the example file first:

```bash
cp .env.local.example .env.local
```

Then configure at least these values:

```dotenv
LLM_API_KEY="your-dashscope-api-key"
LLM_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
LLM_MODEL="qwen-plus"
```

Optional values:

```dotenv
GITHUB_TOKEN="your-github-token"
GITHUB_USE_MODELS="true"
NEXT_PUBLIC_CALLGRAPH_MAX_DEPTH="2"
NEXT_PUBLIC_CALLGRAPH_KEY_CHILDREN_LIMIT="10"
```

Notes:

- The project uses an OpenAI-compatible Chat Completions API interface
- You can swap providers by changing environment variables only
- Runtime settings from the top-right panel are stored in browser storage
- If both env vars and browser settings exist, env vars take precedence on startup

### Start the Development Server

```bash
npm run dev
```

Open:

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

## Using the App

### Analyze a GitHub Repository

1. Choose the GitHub tab on the home page
2. Enter a repository URL such as https://github.com/microsoft/vscode
3. Click Analyze
4. Wait for the workflow to complete

### Analyze a Local Project

1. Switch to the Local Project tab
2. Enter a local path, or choose a folder in supported browsers
3. Click Analyze
4. Inspect the tree, code, summary, and graph panels

## Output Files

Call graph output:

```text
analysis-output/<repo-name>.callgraph.json
```

Module analysis output:

```text
analysis-output/<repo-name>.module-analysis.json
```

Typical contents include:

- repository name and source URL
- project summary
- confirmed entry file
- current call graph tree
- languages and tech stack
- modules and function assignments

## Project Structure

```text
app/                 App Router pages and API routes
components/          UI panels and reusable components
lib/                 Core logic for GitHub, LLM, call graph, storage
public/              Static assets
docs/                Design docs and planning notes
```

## Current Limitations

- Call graph and module results depend on LLM output rather than strict static analysis
- Very large repositories and highly dynamic frameworks may reduce accuracy
- GitHub analysis is mainly aimed at public repositories
- Local project support depends on browser capabilities or server-side path access
