# Panocode

Panocode is a Next.js app for exploring public GitHub repositories with AI-assisted project analysis, entry-point detection, call graph expansion, and functional module grouping.

## Features

- Analyze repository structure, languages, and tech stack
- Verify probable entry files with AI
- Generate a recursive function panorama / call graph
- Expand or collapse panorama nodes and manually drill a single node one level deeper
- Group analyzed functions into up to 10 functional modules
- Color panorama nodes by module and filter the graph by module
- Show workflow status directly in the AI log panel
- Save call graph and module analysis results into project files under analysis-output/

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## AI Analysis Setup

Create a local environment file before using the repository analysis feature:

```bash
cp .env.local.example .env.local
```

Then configure these values in `.env.local`:

```dotenv
LLM_API_KEY="your-dashscope-api-key"
LLM_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
LLM_MODEL="qwen-plus"
```

Notes:

- `.env.local` is already ignored by git via `.gitignore`, so your key should stay out of source control.
- The analysis route reads `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` from the server environment.
- The analysis route uses an OpenAI-compatible chat completions API, so you can switch providers by changing only these environment variables.
- A working Aliyun DashScope / 百炼 example is shown above. If you switch back to Gemini later, update only the same three variables.

Additional optional values:

```dotenv
GITHUB_TOKEN="your-github-token"
GITHUB_USE_MODELS="true"
NEXT_PUBLIC_CALLGRAPH_MAX_DEPTH="2"
NEXT_PUBLIC_CALLGRAPH_KEY_CHILDREN_LIMIT="10"
```

The app also provides a settings dialog in the top-right corner. Those settings are persisted in browser storage. If both browser storage and environment variables are present, the environment variables win at startup and are shown in the settings dialog as the effective values.

## Analysis Workflow

1. Load repository metadata and file tree from GitHub
2. Analyze repository languages, tech stack, and candidate entry files
3. Verify candidate entry files one by one
4. Build the top-level call graph for the confirmed entry file
5. Recursively expand key functions
6. Allow manual one-level drill-down for suggested or uncertain leaf nodes
7. Save the current call graph JSON into analysis-output/
8. Group all analyzed functions into functional modules
9. Save the module analysis JSON into analysis-output/

## Output Files

When call graph analysis completes, the app writes a JSON artifact to:

```text
analysis-output/<repo-name>.callgraph.json
```

The saved JSON includes:

- repository name and URL
- project summary and description
- current panorama call graph tree, including manually drilled nodes

When module analysis completes, the app writes a JSON artifact to:

```text
analysis-output/<repo-name>.module-analysis.json
```

The saved JSON includes:

- repository name and URL
- project summary and description
- languages and tech stack
- module list
- function-to-module assignments

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
