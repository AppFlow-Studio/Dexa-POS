import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useEffect, useRef } from "react";

/**
 * Detects payment sheet close and triggers syncOrderFromBackendComplete.
 * Calls onSyncStart / onSyncEnd to coordinate with session phase.
 */
export function useTablePaymentSync(
  orderId: string | undefined,
  onSyncStart: () => void,
  onSyncEnd: () => void,
) {
  const isPaymentSheetOpen = usePaymentStore((s) => s.isOpen);
  const syncOrderFromBackendComplete = useOrderStore(
    (s) => s.syncOrderFromBackendComplete,
  );
  const wasOpenRef = useRef(false);

  // Use refs for callbacks to avoid stale closures without re-triggering the effect
  const onSyncStartRef = useRef(onSyncStart);
  const onSyncEndRef = useRef(onSyncEnd);
  onSyncStartRef.current = onSyncStart;
  onSyncEndRef.current = onSyncEnd;

  useEffect(() => {
    if (wasOpenRef.current && !isPaymentSheetOpen) {
      console.log("[PaymentSync] Sheet closed. Syncing from database...");
      onSyncStartRef.current();

      // Immediately dispatch table status from local state
      // (syncPaymentToBackend already set authoritative paid_status)
      onSyncEndRef.current();

      // Background sync for data consistency (non-blocking)
      if (orderId) {
        syncOrderFromBackendComplete(orderId)
          .catch((error) => {
            console.error("[PaymentSync] Failed to sync order:", error);
          })
          .finally(() => {
            onSyncEndRef.current(); // Safety net re-check
          });
      }
    }
    wasOpenRef.current = isPaymentSheetOpen;
  }, [isPaymentSheetOpen, orderId, syncOrderFromBackendComplete]);
}
