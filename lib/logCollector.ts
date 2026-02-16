import { LogEntry } from "@/types/remoteActions";

const BUFFER_SIZE = 1000;

let buffer: LogEntry[] = [];
let writeIndex = 0;
let count = 0;
let initialized = false;

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

function addEntry(level: LogEntry["level"], args: unknown[]) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" "),
  };

  if (buffer.length < BUFFER_SIZE) {
    buffer.push(entry);
  } else {
    buffer[writeIndex] = entry;
  }
  writeIndex = (writeIndex + 1) % BUFFER_SIZE;
  count++;
}

/**
 * Initialize log collector by patching console methods.
 * Idempotent - safe to call multiple times.
 */
export function initLogCollector() {
  if (initialized) return;
  initialized = true;

  console.log = (...args: unknown[]) => {
    addEntry("log", args);
    originalConsole.log(...args);
  };

  console.warn = (...args: unknown[]) => {
    addEntry("warn", args);
    originalConsole.warn(...args);
  };

  console.error = (...args: unknown[]) => {
    addEntry("error", args);
    originalConsole.error(...args);
  };
}

/**
 * Get recent log entries in chronological order.
 */
export function getRecentLogs(maxCount: number = BUFFER_SIZE): LogEntry[] {
  const total = Math.min(count, BUFFER_SIZE);
  const requested = Math.min(maxCount, total);

  if (total < BUFFER_SIZE) {
    // Buffer hasn't wrapped yet
    return buffer.slice(Math.max(0, total - requested));
  }

  // Buffer has wrapped - read from oldest to newest
  const result: LogEntry[] = [];
  const startIdx =
    (writeIndex - requested + BUFFER_SIZE) % BUFFER_SIZE;
  for (let i = 0; i < requested; i++) {
    result.push(buffer[(startIdx + i) % BUFFER_SIZE]);
  }
  return result;
}

/**
 * Get logs formatted as text for upload.
 */
export function getLogsAsText(maxCount?: number): string {
  return getRecentLogs(maxCount)
    .map((e) => `[${e.timestamp}] [${e.level.toUpperCase()}] ${e.message}`)
    .join("\n");
}

/**
 * Clear the log buffer.
 */
export function clearLogs() {
  buffer = [];
  writeIndex = 0;
  count = 0;
}
