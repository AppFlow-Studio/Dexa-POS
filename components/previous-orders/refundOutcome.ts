import type { RefundResult, RefundRpcOutcome } from "@/types/refunds";

type ToastType = "success" | "warning" | "error";
export type RefundToastSpec = {
  title: string;
  message: string;
  type: ToastType;
};

/**
 * Maps a refund outcome to the toast that should be shown, and whether the
 * refund actually succeeded (`ok`). Centralizes the rule so every refund
 * surface (AdvancedRefundModal / SimpleRefundModal / RefundModal) treats a
 * failed terminal refund the same way — instead of unconditionally showing a
 * green "Refund Successful" the moment the call returns.
 *
 *   kind:"error"                               → FAILED (red)
 *   kind:"success" + data.success === false    → FAILED (red)
 *   kind:"success" + data.error (partial batch)→ PARTIAL (yellow warning)
 *   kind:"success" clean / kind:"verifying"    → SUCCESS (green)
 *
 * `verifying` is treated as success here because the terminal already approved
 * (the money moved) and the backend write will reconcile; modals with a
 * dedicated verifying view should intercept it BEFORE calling this.
 *
 * `ok` is false only for the failed case — callers must not close/record/mark
 * the order refunded when `ok` is false.
 */
export function resolveRefundToast(
  outcome: RefundRpcOutcome<RefundResult> | undefined,
  opts: { successTitle: string; successMessage: string },
): { ok: boolean; partial: boolean; toast: RefundToastSpec } {
  if (outcome?.kind === "error") {
    return {
      ok: false,
      partial: false,
      toast: {
        title: "Refund Failed",
        message: outcome.error || "The refund could not be processed.",
        type: "error",
      },
    };
  }

  const data = outcome?.kind === "success" ? outcome.data : undefined;

  if (data && data.success === false) {
    return {
      ok: false,
      partial: false,
      toast: {
        title: "Refund Failed",
        message: data.error || "The refund could not be processed.",
        type: "error",
      },
    };
  }

  if (data?.error) {
    return {
      ok: true,
      partial: true,
      toast: { title: "Partial Refund", message: data.error, type: "warning" },
    };
  }

  return {
    ok: true,
    partial: false,
    toast: {
      title: opts.successTitle,
      message: opts.successMessage,
      type: "success",
    },
  };
}
