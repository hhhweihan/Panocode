export interface CallgraphLanguageInput {
  name: string;
  percentage: number;
}

export interface CallgraphTechStackInput {
  name: string;
  category: string;
}

export interface CallgraphBridgeInfo {
  strategyId: string;
  strategyName: string;
  reason: string;
  evidence: string[];
}

export interface CallgraphPromptContext {
  repoName: string;
  filePath: string;
  fileContent: string;
  allFilePaths: string[];
  locale: "zh" | "en";
  languages?: CallgraphLanguageInput[];
  techStack?: CallgraphTechStackInput[];
  summary?: string | null;
  description?: string | null;
}

interface CallgraphBridgeStrategy {
  id: string;
  name: string;
  matches: (context: CallgraphPromptContext) => boolean;
  buildEvidence: (context: CallgraphPromptContext) => string[];
  buildReason: (context: CallgraphPromptContext) => string;
  buildPrompt: (context: CallgraphPromptContext, languageInstruction: string) => string;
}

function pushEvidence(evidence: string[], condition: boolean, message: string) {
  if (condition) {
    evidence.push(message);
  }
}

function normalizeTechName(value: string): string {
  return value.trim().toLowerCase();
}

function hasJavaLikeLanguage(context: CallgraphPromptContext): boolean {
  return (context.languages ?? []).some((item) => {
    const name = normalizeTechName(item.name);
    return name === "java" || name === "kotlin";
  }) || /\.(java|kt)$/i.test(context.filePath);
}

function hasPythonLikeLanguage(context: CallgraphPromptContext): boolean {
  return (context.languages ?? []).some((item) => normalizeTechName(item.name) === "python")
    || /\.py$/i.test(context.filePath);
}

function hasNodeLikeLanguage(context: CallgraphPromptContext): boolean {
  return (context.languages ?? []).some((item) => {
    const name = normalizeTechName(item.name);
    return name === "javascript" || name === "typescript";
  }) || /\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(context.filePath);
}

function hasGoLikeLanguage(context: CallgraphPromptContext): boolean {
  return (context.languages ?? []).some((item) => normalizeTechName(item.name) === "go")
    || /\.go$/i.test(context.filePath);
}

function hasPhpLikeLanguage(context: CallgraphPromptContext): boolean {
  return (context.languages ?? []).some((item) => normalizeTechName(item.name) === "php")
    || /\.php$/i.test(context.filePath);
}

function hasSpringBootTech(context: CallgraphPromptContext): boolean {
  return (context.techStack ?? []).some((item) => {
    const name = normalizeTechName(item.name);
    return name.includes("spring boot") || name === "spring" || name.includes("spring mvc");
  });
}

function hasSpringBootEntrySignals(context: CallgraphPromptContext): boolean {
  const content = context.fileContent.toLowerCase();
  return content.includes("@springbootapplication")
    || content.includes("springapplication.run")
    || content.includes("implements commandlinerunner")
    || content.includes("implements applicationrunner");
}

function hasControllerFiles(context: CallgraphPromptContext): boolean {
  return context.allFilePaths.some((path) => /controller/i.test(path) && /\.(java|kt)$/i.test(path));
}

function hasPythonTech(context: CallgraphPromptContext, matcher: (name: string) => boolean): boolean {
  return (context.techStack ?? []).some((item) => matcher(normalizeTechName(item.name)));
}

function hasNodeTech(context: CallgraphPromptContext, matcher: (name: string) => boolean): boolean {
  return (context.techStack ?? []).some((item) => matcher(normalizeTechName(item.name)));
}

function hasGoTech(context: CallgraphPromptContext, matcher: (name: string) => boolean): boolean {
  return (context.techStack ?? []).some((item) => matcher(normalizeTechName(item.name)));
}

function hasPhpTech(context: CallgraphPromptContext, matcher: (name: string) => boolean): boolean {
  return (context.techStack ?? []).some((item) => matcher(normalizeTechName(item.name)));
}

function hasPythonRouteFiles(context: CallgraphPromptContext): boolean {
  return context.allFilePaths.some((path) => /(^|\/)(views|routes|router|endpoints|urls|api|wsgi|asgi)\.py$/i.test(path));
}

function hasFlaskSignals(context: CallgraphPromptContext): boolean {
  const content = context.fileContent.toLowerCase();
  return hasPythonTech(context, (name) => name === "flask" || name.includes("flask "))
    || content.includes("from flask import")
    || content.includes("import flask")
    || content.includes("flask(__name__)")
    || content.includes("@app.route")
    || content.includes("blueprint(")
    || context.allFilePaths.some((path) => /blueprints?\.py$/i.test(path));
}

function hasFastApiSignals(context: CallgraphPromptContext): boolean {
  const content = context.fileContent.toLowerCase();
  return hasPythonTech(context, (name) => name === "fastapi")
    || content.includes("from fastapi import")
    || content.includes("fastapi(")
    || content.includes("apirouter(")
    || /@(app|router)\.(get|post|put|delete|patch|options|head)\(/i.test(context.fileContent)
    || content.includes("uvicorn.run(");
}

function hasDjangoSignals(context: CallgraphPromptContext): boolean {
  const content = context.fileContent.toLowerCase();
  return hasPythonTech(context, (name) => name === "django")
    || content.includes("django.core.wsgi")
    || content.includes("get_wsgi_application")
    || content.includes("django_settings_module")
    || context.allFilePaths.some((path) => /(^|\/)(manage|wsgi|asgi|urls|views)\.py$/i.test(path));
}

function hasWsgiSignals(context: CallgraphPromptContext): boolean {
  const content = context.fileContent.toLowerCase();
  return content.includes("get_wsgi_application")
    || /\bapplication\s*=\s*/i.test(context.fileContent)
    || content.includes("wsgi")
    || content.includes("gunicorn")
    || content.includes("uwsgi")
    || context.allFilePaths.some((path) => /(^|\/)(wsgi|asgi)\.py$/i.test(path));
}

function hasNodeRouteFiles(context: CallgraphPromptContext): boolean {
  return context.allFilePaths.some((path) =>
    /(^|\/)(routes?|router|controllers?|handlers?|modules?)\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(path)
    || /(^|\/)(routes?|router|controllers?|handlers?)\//i.test(path),
  );
}

function hasExpressSignals(context: CallgraphPromptContext): boolean {
  const content = context.fileContent.toLowerCase();
  return hasNodeTech(context, (name) => name === "express")
    || content.includes("from 'express'")
    || content.includes('from "express"')
    || content.includes("require('express')")
    || content.includes('require("express")')
    || content.includes("express()")
    || /\b(app|router)\.(get|post|put|delete|patch|options|head|all|use)\(/i.test(context.fileContent);
}

function hasFastifyNodeSignals(context: CallgraphPromptContext): boolean {
  const content = context.fileContent.toLowerCase();
  return hasNodeTech(context, (name) => name === "fastify")
    || content.includes("from 'fastify'")
    || content.includes('from "fastify"')
    || content.includes("fastify()")
    || /\bfastify\.(get|post|put|delete|patch|options|head|route|register)\(/i.test(context.fileContent)
    || content.includes("await app.register(");
}

function hasKoaSignals(context: CallgraphPromptContext): boolean {
  const content = context.fileContent.toLowerCase();
  return hasNodeTech(context, (name) => name === "koa" || name === "koa-router" || name === "@koa/router")
    || content.includes("new koa(")
    || content.includes("from 'koa'")
    || content.includes('from "koa"')
    || content.includes("@koa/router")
    || content.includes("koa-router")
    || /\brouter\.(get|post|put|delete|patch|options|head|all|use)\(/i.test(context.fileContent);
}

function hasNestSignals(context: CallgraphPromptContext): boolean {
  const content = context.fileContent.toLowerCase();
  return hasNodeTech(context, (name) => name === "nestjs" || name === "nest" || name === "@nestjs/core" || name === "@nestjs/common")
    || content.includes("@nestjs/core")
    || content.includes("@nestjs/common")
    || content.includes("nestfactory.create")
    || content.includes("@controller(")
    || /@(get|post|put|delete|patch|options|head|all)\(/i.test(context.fileContent)
    || context.allFilePaths.some((path) => /(^|\/)(main|app\.module|app\.controller)\.(ts|js)$/i.test(path));
}

function hasGoRouteFiles(context: CallgraphPromptContext): boolean {
  return context.allFilePaths.some((path) =>
    /(^|\/)(routes?|router|controllers?|handlers?|api|server|main)\.go$/i.test(path)
    || /(^|\/)(routes?|router|controllers?|handlers?)\//i.test(path),
  );
}

function hasGinSignals(context: CallgraphPromptContext): boolean {
  return hasGoTech(context, (name) => name === "gin" || name === "gin-gonic")
    || context.fileContent.includes("github.com/gin-gonic/gin")
    || /\brouter\.(GET|POST|PUT|DELETE|PATCH|Any|Group|Use)\(/.test(context.fileContent)
    || /\br\.(GET|POST|PUT|DELETE|PATCH|Any|Group|Use)\(/.test(context.fileContent);
}

function hasEchoSignals(context: CallgraphPromptContext): boolean {
  return hasGoTech(context, (name) => name === "echo" || name.includes("labstack/echo"))
    || context.fileContent.includes("github.com/labstack/echo")
    || /\be\.(GET|POST|PUT|DELETE|PATCH|Any|Group|Use)\(/.test(context.fileContent)
    || /\bgroup\.(GET|POST|PUT|DELETE|PATCH|Any|Use)\(/.test(context.fileContent);
}

function hasFiberSignals(context: CallgraphPromptContext): boolean {
  return hasGoTech(context, (name) => name === "fiber" || name.includes("gofiber/fiber"))
    || context.fileContent.includes("github.com/gofiber/fiber")
    || /\bapp\.(Get|Post|Put|Delete|Patch|All|Group|Use)\(/.test(context.fileContent)
    || /\bgroup\.(Get|Post|Put|Delete|Patch|All|Use)\(/.test(context.fileContent);
}

function hasPhpRouteFiles(context: CallgraphPromptContext): boolean {
  return context.allFilePaths.some((path) =>
    /(^|\/)(routes|web|api|controllers?|kernel|index|artisan)\.php$/i.test(path)
    || /(^|\/)(routes|controllers?)\//i.test(path),
  );
}

function hasLaravelSignals(context: CallgraphPromptContext): boolean {
  const content = context.fileContent;
  return hasPhpTech(context, (name) => name === "laravel")
    || context.allFilePaths.some((path) => /^(routes\/(web|api)\.php|artisan|app\/Http\/Controllers\/)/i.test(path))
    || content.includes("Illuminate\\")
    || content.includes("Route::get(")
    || content.includes("Route::post(")
    || content.includes("Route::middleware(")
    || content.includes("->group(function")
    || content.includes("Laravel\\Framework");
}

function hasSymfonySignals(context: CallgraphPromptContext): boolean {
  const content = context.fileContent;
  return hasPhpTech(context, (name) => name === "symfony")
    || context.allFilePaths.some((path) => /^(config\/routes|src\/Controller\/|public\/index\.php)/i.test(path))
    || content.includes("Symfony\\Component\\")
    || content.includes("#[Route(")
    || content.includes("@Route(")
    || content.includes("AbstractController")
    || content.includes("Kernel::class");
}

function buildRepoContextBlock(context: CallgraphPromptContext): string {
  const languageSummary = (context.languages ?? [])
    .slice(0, 5)
    .map((item) => `${item.name} (${item.percentage}%)`)
    .join(", ");
  const techSummary = (context.techStack ?? [])
    .slice(0, 10)
    .map((item) => `${item.name} [${item.category}]`)
    .join(", ");

  return [
    context.description ? `Repository description: ${context.description}` : null,
    context.summary ? `Repository summary: ${context.summary}` : null,
    languageSummary ? `Detected languages: ${languageSummary}` : null,
    techSummary ? `Detected tech stack: ${techSummary}` : null,
  ].filter(Boolean).join("\n");
}

function buildNodeFieldInstructions(): string {
  return `For each one provide:
- name: the exact function/class/module name as it appears in source
- likelyFile: best-guess relative file path from the repo root (pick from the file list above; use null if purely external/stdlib/third-party)
- drillDown: 1 if this is a substantial internal sub-system worth further analysis, 0 if uncertain, -1 if trivial/external/stdlib
- description: one sentence explaining what it does
- nodeType: "controller" for HTTP route handlers, controller endpoints, or view handlers, otherwise "function", "module", or "framework"
- routePath: HTTP URL or route pattern if this node handles one directly, otherwise null
- bridgeNote: brief note only when this node is introduced by framework bridging rather than a direct code call, otherwise null`;
}

function buildNodeJsonShape(): string {
  return `{
  "rootFunction": "name of the main entry function or module",
  "children": [
    {
      "name": "string",
      "likelyFile": "string | null",
      "drillDown": -1 | 0 | 1,
      "description": "string",
      "nodeType": "function" | "controller" | "module" | "framework",
      "routePath": "string | null",
      "bridgeNote": "string | null"
    }
  ]
}`;
}

function buildDefaultPrompt(context: CallgraphPromptContext, languageInstruction: string): string {
  const fileListSample = context.allFilePaths.slice(0, 300).join("\n");
  const repoContext = buildRepoContextBlock(context);

  return `You are analyzing the confirmed entry point of a GitHub repository to identify its key direct sub-functions.

Repository: ${context.repoName}
Entry file: ${context.filePath}
${repoContext ? `\n${repoContext}\n` : ""}
Entry file content:
\`\`\`
${context.fileContent}
\`\`\`

Repository file paths (for locating functions):
${fileListSample}

Task: Identify up to 20 key functions, methods, or modules directly called from this entry point that are truly significant to understanding the project's core feature flow and architecture.

Strict filtering rules:
- Return only calls that are part of the core business flow, request handling flow, orchestration flow, rendering flow, major subsystem coordination, or important domain logic.
- Do NOT return routine data-structure operations, container manipulation, string operations, formatting/parsing helpers, serialization/deserialization helpers, logging calls, trivial validation wrappers, getters/setters, constructors/destructors, or other low-level utility calls unless they are clearly central to the product's main flow.
- Prefer fewer, higher-signal callees over exhaustive lists.
- For object-oriented languages, return the fully qualified callable name when possible, for example ClassName::methodName, Namespace::ClassName::methodName, or ClassName.methodName.

${buildNodeFieldInstructions()}

Language requirement:
- ${languageInstruction}

Return JSON only. No markdown fences. Exact shape:
${buildNodeJsonShape()}`;
}

const springBootControllerBridge: CallgraphBridgeStrategy = {
  id: "springboot-controller-bridge",
  name: "Spring Boot Controller Bridge",
  matches: (context) => {
    return hasJavaLikeLanguage(context)
      && hasControllerFiles(context)
      && (hasSpringBootTech(context) || hasSpringBootEntrySignals(context));
  },
  buildReason: (context) => {
    return context.locale === "zh"
      ? "检测到 Spring Boot 启动入口，已从框架启动流程桥接到 Controller 请求处理入口。"
      : "Detected a Spring Boot startup entry and bridged from framework startup flow to controller request handlers.";
  },
  buildEvidence: (context) => {
    const evidence: string[] = [];
    pushEvidence(evidence, hasJavaLikeLanguage(context), "Java/Kotlin language or file signal");
    pushEvidence(evidence, hasSpringBootTech(context), "Spring Boot tech stack signal");
    pushEvidence(evidence, hasSpringBootEntrySignals(context), "Spring Boot startup annotation or run signal");
    pushEvidence(evidence, hasControllerFiles(context), "Controller source files detected");
    return evidence;
  },
  buildPrompt: (context, languageInstruction) => {
    const fileListSample = context.allFilePaths.slice(0, 400).join("\n");
    const repoContext = buildRepoContextBlock(context);

    return `You are analyzing a framework-managed application entry point in a GitHub repository.

Repository: ${context.repoName}
Framework bridge mode: Spring Boot startup -> Controller handlers
Entry file: ${context.filePath}
${repoContext ? `\n${repoContext}\n` : ""}
Entry file content:
\`\`\`
${context.fileContent}
\`\`\`

Repository file paths (for locating controllers and handlers):
${fileListSample}

Task: Because Spring Boot dispatches requests through framework annotations rather than explicit direct calls from the startup entry, bridge from the application entry point to the most important Controller request handlers and treat them as the first analyzable business-flow nodes.

What to return:
- Up to 20 important controller/request handler methods that represent major business or API entry routes.
- Prefer methods declared in classes annotated like @RestController or @Controller.
- Combine class-level and method-level mapping annotations into a resolved routePath when possible.
- Set nodeType to "controller" for controller handlers.
- Set bridgeNote to a short sentence indicating this handler is reached via Spring framework dispatch.

Strict filtering rules:
- Prioritize endpoints that best explain the system's core capabilities, not every CRUD or health-check route.
- Do NOT return SpringApplication.run, bean factory methods, configuration classes, interceptors, filters, repositories, DTOs, or framework plumbing unless they are truly the main business entry point.
- Prefer handler methods over controller classes when possible, so each returned node can carry its own routePath.
- If a routePath cannot be resolved confidently, still return the handler and use null for routePath.

${buildNodeFieldInstructions()}

Additional bridge constraints:
- rootFunction should still be the real startup entry class or startup method.
- drillDown should usually be 1 for important internal controller handlers, 0 for uncertain handlers, and -1 only for trivial/external cases.

Language requirement:
- ${languageInstruction}

Return JSON only. No markdown fences. Exact shape:
${buildNodeJsonShape()}`;
  },
};

const pythonWebRouteBridge: CallgraphBridgeStrategy = {
  id: "python-web-route-bridge",
  name: "Python Web Route Bridge",
  matches: (context) => {
    if (!hasPythonLikeLanguage(context)) {
      return false;
    }

    return hasPythonRouteFiles(context)
      || hasFlaskSignals(context)
      || hasFastApiSignals(context)
      || hasDjangoSignals(context)
      || hasWsgiSignals(context);
  },
  buildReason: (context) => {
    const framework = hasFastApiSignals(context)
      ? "FastAPI"
      : hasFlaskSignals(context)
        ? "Flask"
        : hasDjangoSignals(context)
          ? "Django"
          : "Python WSGI";

    return context.locale === "zh"
      ? `检测到 ${framework} 或 WSGI 启动模式，已从应用入口桥接到路由响应函数。`
      : `Detected ${framework} or WSGI startup flow and bridged from application entry to HTTP route handlers.`;
  },
  buildEvidence: (context) => {
    const evidence: string[] = [];
    pushEvidence(evidence, hasPythonLikeLanguage(context), "Python language or file signal");
    pushEvidence(evidence, hasPythonRouteFiles(context), "Python route/view/url files detected");
    pushEvidence(evidence, hasFlaskSignals(context), "Flask route registration signal");
    pushEvidence(evidence, hasFastApiSignals(context), "FastAPI decorator/router signal");
    pushEvidence(evidence, hasDjangoSignals(context), "Django urls/views/wsgi signal");
    pushEvidence(evidence, hasWsgiSignals(context), "WSGI bootstrap signal");
    return evidence;
  },
  buildPrompt: (context, languageInstruction) => {
    const fileListSample = context.allFilePaths.slice(0, 400).join("\n");
    const repoContext = buildRepoContextBlock(context);

    return `You are analyzing a Python web application entry point in a GitHub repository.

Repository: ${context.repoName}
Framework bridge mode: Python web entry -> route handlers
Entry file: ${context.filePath}
${repoContext ? `\n${repoContext}\n` : ""}
Entry file content:
\`\`\`
${context.fileContent}
\`\`\`

Repository file paths (for locating route handlers, views, and URL declarations):
${fileListSample}

Task: Because Python web frameworks often dispatch requests through decorators, URL registries, app objects, or WSGI exports instead of explicit direct calls from the startup entry, bridge from the application entry point to the most important HTTP route response functions or view handlers and treat them as the first analyzable business-flow nodes.

Framework coverage requirements:
- Flask: detect handlers registered through @app.route, Blueprint.route, add_url_rule, or blueprint registration.
- FastAPI: detect handlers registered through @app.get/post/etc, APIRouter, include_router, and lifespan/app startup wiring.
- Django: detect URL patterns in urls.py and map them to function-based views, class-based views, viewsets, or API handlers.
- WSGI startup: if the project starts via wsgi.py, application = ..., gunicorn/uwsgi entry, or exports an app/application callable, still bridge to the main framework route handlers behind that callable.

Django mapping requirements:
- Follow include(...) chains recursively and combine every parent prefix into the final routePath.
- Resolve path(...), re_path(...), router.register(...), DefaultRouter/SimpleRouter, and view.as_view(...) patterns when present.
- Prefer the concrete handler behind class-based views, Django REST Framework viewsets, or APIView subclasses.
- Ignore admin/debug/docs/static routes unless they represent the main business behavior.

What to return:
- Up to 20 important route handler functions, class-based view endpoints, or API response handlers that best represent the product's main capabilities.
- Prefer concrete request handlers over app factory functions, framework setup helpers, middleware, settings modules, or infrastructure code.
- Resolve routePath when possible from decorators, Blueprint prefixes, APIRouter prefixes, include_router calls, Django urlpatterns, path/re_path entries, or WSGI wiring context.
- Set nodeType to "controller" for these route handlers or view handlers.
- Set bridgeNote to a short sentence indicating the handler is reached via framework routing or WSGI dispatch.

Strict filtering rules:
- Prioritize endpoints that explain core product behavior, not admin, debug, metrics, swagger, static file, health check, migration, or framework-generated routes unless those are the main feature.
- Do NOT return app factory helpers, create_app, middleware registration, serializer/schema declarations, settings/config modules, ORM model definitions, or low-level framework plumbing unless they are themselves the main feature entry.
- Prefer the final response handler function or method that owns business behavior.
- If a routePath cannot be resolved confidently, still return the handler and use null for routePath.

${buildNodeFieldInstructions()}

Additional bridge constraints:
- rootFunction should remain the actual startup entry, exported app/application callable, or WSGI bootstrap target.
- For Django class-based views, use the most meaningful view class or handler method name that appears in source.
- drillDown should usually be 1 for important internal route handlers, 0 for uncertain handlers, and -1 only for trivial/external cases.

Language requirement:
- ${languageInstruction}

Return JSON only. No markdown fences. Exact shape:
${buildNodeJsonShape()}`;
  },
};

const nodeWebRouteBridge: CallgraphBridgeStrategy = {
  id: "node-web-route-bridge",
  name: "Node.js Web Route Bridge",
  matches: (context) => {
    if (!hasNodeLikeLanguage(context)) {
      return false;
    }

    return hasNodeRouteFiles(context)
      || hasExpressSignals(context)
      || hasFastifyNodeSignals(context)
      || hasKoaSignals(context)
      || hasNestSignals(context);
  },
  buildReason: (context) => {
    const framework = hasNestSignals(context)
      ? "NestJS"
      : hasFastifyNodeSignals(context)
        ? "Fastify"
        : hasKoaSignals(context)
          ? "Koa"
          : "Express";

    return context.locale === "zh"
      ? `检测到 ${framework} 路由启动模式，已从应用入口桥接到 HTTP 路由处理函数。`
      : `Detected ${framework} routing startup flow and bridged from application entry to HTTP route handlers.`;
  },
  buildEvidence: (context) => {
    const evidence: string[] = [];
    pushEvidence(evidence, hasNodeLikeLanguage(context), "JavaScript/TypeScript language or file signal");
    pushEvidence(evidence, hasNodeRouteFiles(context), "Node router/controller files detected");
    pushEvidence(evidence, hasExpressSignals(context), "Express registration signal");
    pushEvidence(evidence, hasFastifyNodeSignals(context), "Fastify registration signal");
    pushEvidence(evidence, hasKoaSignals(context), "Koa router signal");
    pushEvidence(evidence, hasNestSignals(context), "NestJS controller/bootstrap signal");
    return evidence;
  },
  buildPrompt: (context, languageInstruction) => {
    const fileListSample = context.allFilePaths.slice(0, 400).join("\n");
    const repoContext = buildRepoContextBlock(context);

    return `You are analyzing a Node.js web application entry point in a GitHub repository.

Repository: ${context.repoName}
Framework bridge mode: Node.js web entry -> route handlers
Entry file: ${context.filePath}
${repoContext ? `\n${repoContext}\n` : ""}
Entry file content:
\`\`\`
${context.fileContent}
\`\`\`

Repository file paths (for locating routers, controllers, and handlers):
${fileListSample}

Task: Because Node.js web frameworks often dispatch requests through route registration, decorators, module wiring, or mounted routers instead of explicit direct calls from the startup entry, bridge from the application entry point to the most important HTTP route handler functions or controller methods and treat them as the first analyzable business-flow nodes.

Framework coverage requirements:
- Express: detect handlers registered through app.get/post/use, router.get/post/use, app.use('/prefix', router), and nested routers.
- Fastify: detect handlers registered through fastify.get/post/route and fastify.register plugins with prefix options.
- Koa: detect handlers registered through router.get/post/use, composed middleware chains, and mounted routers.
- NestJS: detect controllers and methods registered through @Controller and @Get/@Post/etc decorators, including module wiring from main.ts and app modules.

NestJS mapping requirements:
- Resolve bootstrap wiring from main.ts into imported modules and controller classes.
- Combine global prefix, @Controller prefix, explicit version prefix when present, and method decorators into the final routePath.
- Resolve nested module/controller exposure through imported modules when the handler is not declared in the startup file.
- Prefer the concrete controller method over guards, pipes, interceptors, decorators, or service methods.

What to return:
- Up to 20 important route handler functions, controller methods, or final response handlers that best represent the product's main capabilities.
- Prefer concrete request handlers over server bootstrap, plugin registration helpers, middleware-only functions, DTO/schema definitions, or infrastructure code.
- Resolve routePath when possible from mounted router prefixes, plugin prefixes, decorator prefixes, nested routers, or controller prefixes.
- Set nodeType to "controller" for these route handlers or controller methods.
- Set bridgeNote to a short sentence indicating the handler is reached via framework route registration.

Strict filtering rules:
- Prioritize routes that explain the system's core product behavior, not health checks, swagger/docs, metrics, static files, auth guards, or framework setup routes unless they are central.
- Do NOT return app.listen/bootstrap functions, middleware registration, dependency injection setup, module declarations, DTOs, or low-level framework plumbing unless they are themselves the main feature entry.
- Prefer the final business handler for each route, not only the router mounting statement.
- If a routePath cannot be resolved confidently, still return the handler and use null for routePath.

${buildNodeFieldInstructions()}

Additional bridge constraints:
- rootFunction should remain the actual startup entry, bootstrap function, or exported app/server.
- For NestJS, combine @Controller prefixes with method decorators to produce final routePath.
- For Express/Fastify/Koa, combine nested router prefixes when possible.
- drillDown should usually be 1 for important internal route handlers, 0 for uncertain handlers, and -1 only for trivial/external cases.

Language requirement:
- ${languageInstruction}

Return JSON only. No markdown fences. Exact shape:
${buildNodeJsonShape()}`;
  },
};

const goWebRouteBridge: CallgraphBridgeStrategy = {
  id: "go-web-route-bridge",
  name: "Go Web Route Bridge",
  matches: (context) => {
    if (!hasGoLikeLanguage(context)) {
      return false;
    }

    return hasGoRouteFiles(context)
      || hasGinSignals(context)
      || hasEchoSignals(context)
      || hasFiberSignals(context);
  },
  buildReason: (context) => {
    const framework = hasGinSignals(context)
      ? "Gin"
      : hasEchoSignals(context)
        ? "Echo"
        : hasFiberSignals(context)
          ? "Fiber"
          : "Go HTTP";

    return context.locale === "zh"
      ? `检测到 ${framework} 路由注册模式，已从应用入口桥接到 HTTP 路由处理函数。`
      : `Detected ${framework} route registration flow and bridged from application entry to HTTP route handlers.`;
  },
  buildEvidence: (context) => {
    const evidence: string[] = [];
    pushEvidence(evidence, hasGoLikeLanguage(context), "Go language or file signal");
    pushEvidence(evidence, hasGoRouteFiles(context), "Go router/handler files detected");
    pushEvidence(evidence, hasGinSignals(context), "Gin route registration signal");
    pushEvidence(evidence, hasEchoSignals(context), "Echo route registration signal");
    pushEvidence(evidence, hasFiberSignals(context), "Fiber route registration signal");
    return evidence;
  },
  buildPrompt: (context, languageInstruction) => {
    const fileListSample = context.allFilePaths.slice(0, 400).join("\n");
    const repoContext = buildRepoContextBlock(context);

    return `You are analyzing a Go web application entry point in a GitHub repository.

Repository: ${context.repoName}
Framework bridge mode: Go web entry -> route handlers
Entry file: ${context.filePath}
${repoContext ? `\n${repoContext}\n` : ""}
Entry file content:
\`\`\`
${context.fileContent}
\`\`\`

Repository file paths (for locating handlers, routers, and controller-like packages):
${fileListSample}

Task: Because Go web frameworks often register routes on router objects instead of explicitly calling handlers from main, bridge from the application entry point to the most important HTTP route handler functions and treat them as the first analyzable business-flow nodes.

Framework coverage requirements:
- Gin: resolve router.GET/POST/... routes, router groups, and nested Group prefixes.
- Echo: resolve e.GET/POST/... routes, groups, middleware chains, and final handlers.
- Fiber: resolve app.Get/Post/... routes, groups, and mounted prefixes.
- Generic net/http style projects: when http.HandleFunc, mux.HandleFunc, or custom router wiring is present, bridge to the registered handlers.

What to return:
- Up to 20 important HTTP route handlers that best explain the product's main behavior.
- Prefer concrete handler functions over bootstrap code, middleware-only helpers, DI wiring, config loading, or transport setup.
- Resolve routePath when possible from grouped prefixes, mounted routers, and route registration statements.
- Set nodeType to "controller" for these route handlers.
- Set bridgeNote to a short sentence indicating the handler is reached via router registration.

Strict filtering rules:
- Prioritize core business routes, not health checks, metrics, swagger/docs, static asset handlers, or internal debug endpoints unless central.
- Do NOT return ListenAndServe/bootstrap functions, middleware registration, logger setup, or framework plumbing unless they are themselves the main feature entry.
- If a routePath cannot be resolved confidently, still return the handler and use null for routePath.

${buildNodeFieldInstructions()}

Additional bridge constraints:
- rootFunction should remain the actual startup entry or exported server bootstrap.
- Combine router group prefixes into the final routePath when possible.
- drillDown should usually be 1 for important internal route handlers, 0 for uncertain handlers, and -1 only for trivial/external cases.

Language requirement:
- ${languageInstruction}

Return JSON only. No markdown fences. Exact shape:
${buildNodeJsonShape()}`;
  },
};

const phpWebRouteBridge: CallgraphBridgeStrategy = {
  id: "php-web-route-bridge",
  name: "PHP Web Route Bridge",
  matches: (context) => {
    if (!hasPhpLikeLanguage(context)) {
      return false;
    }

    return hasPhpRouteFiles(context)
      || hasLaravelSignals(context)
      || hasSymfonySignals(context);
  },
  buildReason: (context) => {
    const framework = hasLaravelSignals(context)
      ? "Laravel"
      : hasSymfonySignals(context)
        ? "Symfony"
        : "PHP Web";

    return context.locale === "zh"
      ? `检测到 ${framework} 路由分发模式，已从应用入口桥接到 HTTP 路由处理函数。`
      : `Detected ${framework} route dispatch flow and bridged from application entry to HTTP route handlers.`;
  },
  buildEvidence: (context) => {
    const evidence: string[] = [];
    pushEvidence(evidence, hasPhpLikeLanguage(context), "PHP language or file signal");
    pushEvidence(evidence, hasPhpRouteFiles(context), "PHP routes/controllers/front-controller files detected");
    pushEvidence(evidence, hasLaravelSignals(context), "Laravel route/controller signal");
    pushEvidence(evidence, hasSymfonySignals(context), "Symfony route/controller signal");
    return evidence;
  },
  buildPrompt: (context, languageInstruction) => {
    const fileListSample = context.allFilePaths.slice(0, 400).join("\n");
    const repoContext = buildRepoContextBlock(context);

    return `You are analyzing a PHP web application entry point in a GitHub repository.

Repository: ${context.repoName}
Framework bridge mode: PHP web entry -> route handlers
Entry file: ${context.filePath}
${repoContext ? `\n${repoContext}\n` : ""}
Entry file content:
\`\`\`
${context.fileContent}
\`\`\`

Repository file paths (for locating routes, controllers, and handlers):
${fileListSample}

Task: Because PHP web frameworks often dispatch requests through route configuration or controller attributes instead of explicit direct calls from the startup entry, bridge from the application entry point to the most important HTTP route handlers and treat them as the first analyzable business-flow nodes.

Framework coverage requirements:
- Laravel: resolve Route::get/post/... registrations, route groups, prefixes, middleware groups, invokable controllers, and controller method targets.
- Symfony: resolve #[Route(...)] or @Route annotations/attributes, controller classes under src/Controller, and config/routes mappings.
- Generic PHP routing: if index.php or front controller wiring delegates into router/controller resolution, bridge to the final handler methods.

Laravel/Symfony mapping requirements:
- For Laravel, combine Route::prefix, nested Route::group prefixes, middleware groups, api/web route files, and controller targets into the final routePath.
- For Laravel resource or apiResource routes, infer the conventional REST endpoints and map them to the responsible controller methods when they are clearly defined.
- For Symfony, combine class-level and method-level #[Route] or @Route metadata into the final routePath.
- Prefer the concrete controller action over service container setup, event subscribers, middleware, or provider boot logic.

What to return:
- Up to 20 important route handlers or controller methods that best represent the product's main capabilities.
- Prefer concrete controller methods over bootstrap code, service providers, middleware registration, container bindings, or schema/model definitions.
- Resolve routePath when possible from route declarations, nested prefixes, controller prefixes, and attribute/annotation metadata.
- Set nodeType to "controller" for these route handlers or controller methods.
- Set bridgeNote to a short sentence indicating the handler is reached via framework route dispatch.

Strict filtering rules:
- Prioritize core business routes, not debug toolbar, profiler, docs, health check, static asset, or framework-generated routes unless central.
- Do NOT return service providers, kernel setup, middleware aliases, Eloquent models, Doctrine entities, or low-level framework plumbing unless they are themselves the main feature entry.
- If a routePath cannot be resolved confidently, still return the handler and use null for routePath.

${buildNodeFieldInstructions()}

Additional bridge constraints:
- rootFunction should remain the actual front controller, bootstrap file, or exported application kernel/bootstrap target.
- Combine route group prefixes or controller prefixes into the final routePath when possible.
- drillDown should usually be 1 for important internal route handlers, 0 for uncertain handlers, and -1 only for trivial/external cases.

Language requirement:
- ${languageInstruction}

Return JSON only. No markdown fences. Exact shape:
${buildNodeJsonShape()}`;
  },
};

const CALLGRAPH_BRIDGE_STRATEGIES: CallgraphBridgeStrategy[] = [
  springBootControllerBridge,
  pythonWebRouteBridge,
  nodeWebRouteBridge,
  goWebRouteBridge,
  phpWebRouteBridge,
];

export function buildEntryCallgraphPrompt(
  context: CallgraphPromptContext,
  languageInstruction: string,
): {
  prompt: string;
  bridge: CallgraphBridgeInfo | null;
} {
  const strategy = CALLGRAPH_BRIDGE_STRATEGIES.find((item) => item.matches(context));

  if (!strategy) {
    return {
      prompt: buildDefaultPrompt(context, languageInstruction),
      bridge: null,
    };
  }

  return {
    prompt: strategy.buildPrompt(context, languageInstruction),
    bridge: {
      strategyId: strategy.id,
      strategyName: strategy.name,
      reason: strategy.buildReason(context),
      evidence: strategy.buildEvidence(context),
    },
  };
}
