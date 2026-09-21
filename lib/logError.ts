import { logger, type LogCategory } from "@/lib/logger";
import * as Sentry from "@sentry/react-native";

/**
 * Single error sink: a structured `logger.error` line plus a Sentry capture.
 * New code should route caught errors through this instead of a bare
 * console.error or a silent catch.
 */
export function logError(
  category: LogCategory,
  message: string,
  error: unknown,
  data?: Record<string, unknown>,
): void {
  logger.error(category, message, { ...data, error });
  try {
    Sentry.captureException(
      error instanceof Error ? error : new Error(String(error)),
      { tags: { category }, extra: { message, ...data } },
    );
  } catch {
    // Reporting must never take down the caller.
  }
}
