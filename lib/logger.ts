/**
 * Structured Logger
 *
 * Production-grade logging with:
 * - Log levels: debug, info, warn, error
 * - Per-level gating in production (__DEV__ controls debug visibility)
 * - Structured metadata for search/filter
 * - Sentry breadcrumb hook (activate after Sentry setup — see docs/SENTRY_SETUP.md)
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("sync", "Order synced", { orderId: "abc" });
 *   logger.error("payment", "Payment failed", { error });
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogCategory =
  | "sync"
  | "payment"
  | "order"
  | "table"
  | "broadcast"
  | "conflict"
  | "kitchen"
  | "print"
  | "auth"
  | "general";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_CONSOLE_LEVEL: LogLevel = __DEV__ ? "debug" : "warn";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_CONSOLE_LEVEL];
}

function formatMessage(category: LogCategory, message: string): string {
  return `[${category}] ${message}`;
}

/**
 * Extensible hook for external integrations (e.g. Sentry breadcrumbs).
 * Set via `logger.onLog = (level, category, message, data) => { ... }`
 */
let _onLog:
  | ((
      level: LogLevel,
      category: LogCategory,
      message: string,
      data?: Record<string, any>,
    ) => void)
  | null = null;

function log(
  level: LogLevel,
  category: LogCategory,
  message: string,
  data?: Record<string, any>,
): void {
  const formatted = formatMessage(category, message);

  _onLog?.(level, category, message, data);

  if (!shouldLog(level)) return;

  switch (level) {
    case "debug":
    case "info":
      data ? console.log(formatted, data) : console.log(formatted);
      break;
    case "warn":
      data ? console.warn(formatted, data) : console.warn(formatted);
      break;
    case "error":
      data ? console.error(formatted, data) : console.error(formatted);
      break;
  }
}

export const logger = {
  debug: (category: LogCategory, message: string, data?: Record<string, any>) =>
    log("debug", category, message, data),
  info: (category: LogCategory, message: string, data?: Record<string, any>) =>
    log("info", category, message, data),
  warn: (category: LogCategory, message: string, data?: Record<string, any>) =>
    log("warn", category, message, data),
  error: (category: LogCategory, message: string, data?: Record<string, any>) =>
    log("error", category, message, data),

  /** Attach an external log sink (e.g. Sentry breadcrumbs). */
  set onLog(
    fn:
      | ((
          level: LogLevel,
          category: LogCategory,
          message: string,
          data?: Record<string, any>,
        ) => void)
      | null,
  ) {
    _onLog = fn;
  },
};
