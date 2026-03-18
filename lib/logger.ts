export type LogLevel = "info" | "success" | "error" | "warning";

export interface LogJson {
  request?: unknown;
  response?: unknown;
}

export interface LogEntry {
  id: string;
  time: string; // HH:MM:SS
  level: LogLevel;
  message: string;
  json?: LogJson; // expandable request / response
}

/** Recursively truncate string values longer than maxChars.
 *  Returns a new value safe to JSON.stringify for display. */
export function truncateJsonForDisplay(
  value: unknown,
  maxChars = 500
): unknown {
  if (typeof value === "string") {
    if (value.length > maxChars) {
      const remaining = value.length - maxChars;
      return `${value.slice(0, maxChars)}···(+${remaining} chars)`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => truncateJsonForDisplay(item, maxChars));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        truncateJsonForDisplay(v, maxChars),
      ])
    );
  }
  return value;
}

export function makeLogEntry(
  level: LogLevel,
  message: string,
  json?: LogJson
): LogEntry {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return { id: `${Date.now()}-${Math.random()}`, time, level, message, json };
}
