# Panocode

[English](README.en.md)

AI 代码仓库理解工作台，用于分析 GitHub 仓库与本地项目的结构、入口、调用图和功能模块。

Panocode 是一个面向代码仓库理解与演示的 AI 驱动分析工具。它可以读取 GitHub 仓库或本地项目，自动识别项目结构、候选入口文件、关键调用链和功能模块，并以可视化方式帮助你快速建立对代码库的整体认知。

## 适合的使用场景
- 快速理解一个陌生仓库的整体结构
- 做技术调研、二次开发前的代码摸底
- 向团队成员演示项目入口和关键调用路径
- 对大型仓库进行 AI 辅助的函数级浏览
- 输出结构化分析结果，作为文档或后续自动化处理的输入

## 核心能力

- 支持 GitHub 公共仓库分析
- 支持本地项目分析
- 自动识别语言分布、技术栈和候选入口文件
- 对候选入口进行二次研判，减少误判
- 生成入口函数的全景调用图，并支持递归扩展
- 按功能模块对函数进行归类和着色
- 支持文件树浏览、代码查看、日志追踪
- 支持导出 Markdown 和分析结果 JSON
- 支持运行时配置 AI 提供商、模型和分析深度

## 效果预览

- 首页首屏截图：突出产品定位、双入口和价值点
- 分析工作台截图：展示文件树、源码、仓库洞察、调用全景
- 如果后续支持在线 Demo，也可以在这里补一个公开访问地址

当前占位：

```text
[待补] 首页截图
[待补] 分析页截图
[待补] 在线 Demo 地址
```

## 功能流程

Panocode 的分析流程大致如下：

1. 加载仓库信息与文件树
2. 识别项目语言、技术栈和候选入口文件
3. 逐个校验候选入口文件
4. 基于已确认入口生成顶层调用图
5. 递归扩展关键调用节点
6. 对已分析函数进行模块归类
7. 将结果保存为 JSON 或导出为 Markdown

## 界面说明

主界面由以下区域组成：

- FileTree：查看仓库目录结构
- CodePanel：查看源码内容与高亮
- AnalysisPanel：查看 AI 生成的项目摘要、入口判断、技术栈等信息
- PanoramaPanel：查看调用图、递归扩展结果和模块着色
- LogPanel：查看工作流状态、错误信息和 AI 分析日志

## 快速开始

### 运行环境

- Node.js 20 或更高版本
- npm 10 或更高版本
- 一个可用的 OpenAI 兼容接口，或可选的 GitHub Models 配置

### 安装依赖

```bash
npm install
```

### 配置环境变量

先复制示例配置：

```bash
cp .env.local.example .env.local
```

Windows PowerShell 也可以直接执行：

```powershell
Copy-Item .env.local.example .env.local
```

然后至少配置以下变量：

```dotenv
LLM_API_KEY="your-dashscope-api-key"
LLM_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
LLM_MODEL="qwen-plus"
```

可选变量：

```dotenv
GITHUB_TOKEN="your-github-token"
GITHUB_USE_MODELS="true"
NEXT_PUBLIC_CALLGRAPH_MAX_DEPTH="2"
NEXT_PUBLIC_CALLGRAPH_KEY_CHILDREN_LIMIT="10"
```

说明：

- 项目默认使用 OpenAI 兼容的 Chat Completions 接口
- 你可以替换为阿里云百炼、Google AI Studio 兼容层或其他兼容服务
- 如果启用 GitHub Models，可使用 GITHUB_TOKEN 作为入口研判等环节的补充能力
- 右上角设置面板中的运行时配置会持久化在浏览器本地存储中
- 若环境变量和浏览器设置同时存在，启动时以环境变量为准

### 启动开发环境

```bash
npm run dev
```

默认访问地址：

- http://localhost:3000

### 生产构建

```bash
npm run build
npm run start
```

### 代码检查

```bash
npm run lint
```

## 使用说明

### 分析 GitHub 仓库

1. 在首页选择 GitHub 分析
2. 输入仓库地址，例如 https://github.com/microsoft/vscode
3. 点击 Analyze
4. 等待文件树、项目分析、入口研判、调用图生成完成

### 分析本地项目

1. 在首页切换到本地项目
2. 直接输入本地路径，或在支持 File System Access API 的浏览器中选择文件夹
3. 点击 Analyze
4. 进入分析页后查看文件树、代码内容和调用图结果

## 输出结果

调用图分析完成后，项目会生成：

```text
analysis-output/<repo-name>.callgraph.json
```

模块分析完成后，项目会生成：

```text
analysis-output/<repo-name>.module-analysis.json
```

这些结果通常包含：

- 仓库名和来源地址
- 项目摘要和说明
- 已确认入口文件
- 当前调用图树
- 语言分布与技术栈
- 模块列表和函数归属关系

## 目录结构

```text
app/                 Next.js App Router 页面与 API 路由
components/          页面面板与交互组件
lib/                 GitHub、LLM、调用图、存储等核心逻辑
public/              静态资源
docs/                设计文档与规划
```

## 技术栈

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Lucide React
- Zod

## 当前限制

- 调用图和模块分析依赖 LLM，结果不是严格静态分析结论
- 对超大仓库、动态语言和高度反射式框架，入口识别可能存在偏差
- GitHub 侧主要面向公共仓库；若遇到限流或模型权限问题，需要配置额外凭证
- 本地项目分析依赖浏览器能力或本地路径访问方式，不同环境体验会有差异


## 开发提示

- 核心入口页面在 [app/page.tsx](app/page.tsx) 和 [app/analyze/page.tsx](app/analyze/page.tsx)
- 运行时配置逻辑在 [lib/runtimeSettings.ts](lib/runtimeSettings.ts)
- LLM 调用封装在 [lib/llm.ts](lib/llm.ts)
- 调用图相关逻辑主要在 [lib/callgraphBridge.ts](lib/callgraphBridge.ts) 和 [lib/callgraphUtils.ts](lib/callgraphUtils.ts)

## 常见问题

### 1. 为什么启动后无法分析仓库？

通常是因为未配置 AI 提供商，或 API Key 无效。请优先检查 .env.local 中的 LLM_API_KEY、LLM_BASE_URL、LLM_MODEL。

### 2. 为什么入口文件识别不准确？

入口识别本质上是 AI 辅助推断，并非编译器级精确解析。对多入口项目、脚手架项目或高度动态的代码结构，可能需要人工二次判断。

### 3. 为什么本地项目无法直接选择文件夹？

浏览器文件夹选择依赖 File System Access API，并非所有浏览器都完整支持。你也可以直接输入本地路径走服务端模式。

## English Version

English documentation is available in [README.en.md](README.en.md).
