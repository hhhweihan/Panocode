import type { CallgraphNode, CallgraphResult } from "@/app/api/analyze/callgraph/route";

export interface ModuleAnalysisFunctionInput {
  name: string;
  description: string;
  likelyFile: string | null;
  drillDown: number;
  depth: number;
  parentFunction: string | null;
}

export interface FunctionModuleAssignment {
  functionName: string;
  moduleId: string;
  moduleName: string;
  color: string;
}

export interface FunctionModule {
  id: string;
  name: string;
  description: string;
  color: string;
  functions: string[];
}

export interface ModuleAnalysisResult {
  modules: FunctionModule[];
  assignments: Record<string, FunctionModuleAssignment>;
  savedFilePath?: string | null;
}

export const MODULE_COLOR_PALETTE = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
];

export function flattenCallgraphFunctions(result: CallgraphResult): ModuleAnalysisFunctionInput[] {
  const nodes: ModuleAnalysisFunctionInput[] = [
    {
      name: result.rootFunction,
      description: `Entry/root function in ${result.entryFile}`,
      likelyFile: result.entryFile,
      drillDown: 1,
      depth: 0,
      parentFunction: null,
    },
  ];

  function walk(children: CallgraphNode[], depth: number, parentFunction: string) {
    for (const child of children) {
      nodes.push({
        name: child.name,
        description: child.description,
        likelyFile: child.likelyFile,
        drillDown: child.drillDown,
        depth,
        parentFunction,
      });
      if (child.children && child.children.length > 0) {
        walk(child.children, depth + 1, child.name);
      }
    }
  }

  walk(result.children, 1, result.rootFunction);
  return nodes;
}

export function buildModuleAssignments(modules: FunctionModule[]): Record<string, FunctionModuleAssignment> {
  const assignments: Record<string, FunctionModuleAssignment> = {};
  for (const moduleItem of modules) {
    for (const functionName of moduleItem.functions) {
      assignments[functionName] = {
        functionName,
        moduleId: moduleItem.id,
        moduleName: moduleItem.name,
        color: moduleItem.color,
      };
    }
  }
  return assignments;
}

export function getFunctionModule(
  moduleAnalysis: ModuleAnalysisResult | null | undefined,
  functionName: string,
): FunctionModuleAssignment | null {
  if (!moduleAnalysis) return null;
  return moduleAnalysis.assignments[functionName] ?? null;
}