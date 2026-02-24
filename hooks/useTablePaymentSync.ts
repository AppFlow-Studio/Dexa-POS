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

  useEffect(() => {
    if (wasOpenRef.current && !isPaymentSheetOpen) {
      // Payment sheet just closed
      console.log("[PaymentSync] Sheet closed. Syncing from database...");
      onSyncStart();

      if (orderId) {
        timeoutRef.current = setTimeout(async () => {
          timeoutRef.current = null;
          try {
            await syncOrderFromBackendComplete(orderId);
          } catch (error) {
            console.error("[PaymentSync] Failed to sync order:", error);
          } finally {
            onSyncEnd();
          }
        }, 500);
      } else {
        onSyncEnd();
      }
    }

    wasOpenRef.current = isPaymentSheetOpen;
  }, [isPaymentSheetOpen, orderId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);
}
