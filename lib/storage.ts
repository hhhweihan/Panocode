import type { TreeNode } from "@/lib/github";
import type { AnalysisResult } from "@/app/api/analyze/route";
import type { EntryCheckResult } from "@/app/api/analyze/entry/route";
import type { CallgraphResult } from "@/app/api/analyze/callgraph/route";
import type { LogEntry } from "@/lib/logger";
import type { ModuleAnalysisResult } from "@/lib/moduleAnalysis";

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
  fileTree: TreeNode[];
  analysisResult: AnalysisResult;
  entryCheckResults: Record<string, EntryCheckResult>;
  callgraphResult: CallgraphResult | null;
  moduleAnalysis: ModuleAnalysisResult | null;
  logs: LogEntry[];
}

export interface AnalysisRecordSummary {
  id: string;
  analyzedAt: string;
  url: string;
  repoName: string;
  description: string | null;
  topLanguages: { name: string; color: string }[];
}

export const STORAGE_KEY = "panocode_history";
export const MAX_RECORDS = 20;
const HISTORY_UPDATED_EVENT = "panocode-history-updated";
const EMPTY_HISTORY_SUMMARIES: AnalysisRecordSummary[] = [];

let cachedSummaryRaw: string | null | undefined;
let cachedSummaries: AnalysisRecordSummary[] = EMPTY_HISTORY_SUMMARIES;

function invalidateHistorySummaryCache() {
  cachedSummaryRaw = undefined;
}

function emitHistoryUpdated() {
  invalidateHistorySummaryCache();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(HISTORY_UPDATED_EVENT));
  }
}

export function loadHistory(): AnalysisRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AnalysisRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed.sort(
      (a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime()
    );
  } catch {
    return [];
  }
}

export function saveRecord(record: AnalysisRecord): void {
  const tryWrite = (records: AnalysisRecord[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    emitHistoryUpdated();
  };

  try {
    const existing = loadHistory();
    // Deduplicate by fullName — keep only the newest
    const deduped = existing.filter(
      (r) => r.repoMeta.fullName !== record.repoMeta.fullName
    );
    const next = [record, ...deduped].slice(0, MAX_RECORDS);
    tryWrite(next);
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      // Drop oldest and retry once
      try {
        const existing = loadHistory();
        const trimmed = existing
          .filter((r) => r.repoMeta.fullName !== record.repoMeta.fullName)
          .slice(0, MAX_RECORDS - 2);

        // Skip if the single record is unreasonably large (>1 MB)
        const singleSize = JSON.stringify(record).length;
        if (singleSize > 1_000_000) return;

        const next = [record, ...trimmed];
        tryWrite(next);
      } catch {
        // Give up silently
      }
    }
  }
}

export function getRecordById(id: string): AnalysisRecord | null {
  const records = loadHistory();
  return records.find((r) => r.id === id) ?? null;
}

export function deleteRecord(id: string): void {
  try {
    const records = loadHistory().filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    emitHistoryUpdated();
  } catch {
    // Ignore
  }
}

export function buildSummary(record: AnalysisRecord): AnalysisRecordSummary {
  return {
    id: record.id,
    analyzedAt: record.analyzedAt,
    url: record.url,
    repoName: record.repoMeta.fullName,
    description: record.repoMeta.description,
    topLanguages: record.analysisResult.languages
      .slice(0, 2)
      .map((l) => ({ name: l.name, color: l.color })),
  };
}

export function subscribeHistorySummaries(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      invalidateHistorySummaryCache();
      onStoreChange();
    }
  };

  const handleLocalUpdate = () => {
    onStoreChange();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(HISTORY_UPDATED_EVENT, handleLocalUpdate);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(HISTORY_UPDATED_EVENT, handleLocalUpdate);
  };
}

export function getHistorySummariesSnapshot(): AnalysisRecordSummary[] {
  if (typeof window === "undefined") {
    return EMPTY_HISTORY_SUMMARIES;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cachedSummaryRaw) {
    return cachedSummaries;
  }

  cachedSummaryRaw = raw;
  cachedSummaries = loadHistory().map(buildSummary);
  return cachedSummaries;
}

export function getEmptyHistorySummaries(): AnalysisRecordSummary[] {
  return EMPTY_HISTORY_SUMMARIES;
}
