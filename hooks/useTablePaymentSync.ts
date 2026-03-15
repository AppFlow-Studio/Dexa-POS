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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use refs for callbacks to avoid stale closures without re-triggering the effect
  const onSyncStartRef = useRef(onSyncStart);
  const onSyncEndRef = useRef(onSyncEnd);
  onSyncStartRef.current = onSyncStart;
  onSyncEndRef.current = onSyncEnd;

  useEffect(() => {
    if (wasOpenRef.current && !isPaymentSheetOpen) {
      // Payment sheet just closed
      console.log("[PaymentSync] Sheet closed. Syncing from database...");
      onSyncStartRef.current();

      if (orderId) {
        timeoutRef.current = setTimeout(async () => {
          timeoutRef.current = null;
          try {
            await syncOrderFromBackendComplete(orderId);
          } catch (error) {
            console.error("[PaymentSync] Failed to sync order:", error);
          } finally {
            onSyncEndRef.current();
          }
        }, 150);
      } else {
        onSyncEndRef.current();
      }
    }

    wasOpenRef.current = isPaymentSheetOpen;

    // Clean up timeout when effect re-runs or unmounts
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isPaymentSheetOpen, orderId, syncOrderFromBackendComplete]);
}
