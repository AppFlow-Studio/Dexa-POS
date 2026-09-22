import * as Sentry from "@sentry/react-native";

import { useToastStore } from "@/stores/useToastStore";

export type BumpStatus = "preparing" | "ready" | "served";

/**
 * A bump whose RPC exhausted its retry. Held per ticket so the card can show
 * "tap to retry" and re-issue exactly the same mutation.
 */
export interface FailedBump {
  itemIds: string[];
  newStatus: BumpStatus;
  failedAt: number;
}

export interface BumpFailureContext {
  ticketId: string;
  orderItemIds: string[];
  status: BumpStatus;
  /** True when the store will retry on its own after this failure. */
  willRetry: boolean;
}

/**
 * Surface a failed `bulk_update_order_item_status_v2` call.
 *
 * Charcoal #S1-0020: 13 bumps 500'd (statement timeout) and the KDS showed
 * nothing — the optimistic state was silently reverted by a refetch minutes
 * later, so the cook kept tapping. A bump failure must be visible on the
 * board and in Sentry, every time.
 */
export function reportBumpFailure(
  error: unknown,
  ctx: BumpFailureContext,
): void {
  const message = ctx.willRetry ? "Retrying…" : "Tap the ticket to retry";

  useToastStore.getState().show({
    title: "Couldn't update ticket",
    message,
    type: "error",
    duration: ctx.willRetry ? 2500 : 5000,
  });

  try {
    Sentry.captureException(toError(error), {
      tags: {
        area: "kds",
        rpc: "bulk_update_order_item_status_v2",
        kds_status: ctx.status,
      },
      extra: {
        ticketId: ctx.ticketId,
        orderItemIds: ctx.orderItemIds,
        willRetry: ctx.willRetry,
        errorCode: (error as { code?: string } | null)?.code ?? null,
      },
    });
  } catch {
    // Reporting must never throw into the bump path.
  }
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  const e = error as { message?: string; code?: string } | null;
  const err = new Error(e?.message ?? "KDS bump failed");
  err.name = e?.code ? `KDSBumpError:${e.code}` : "KDSBumpError";
  return err;
}
