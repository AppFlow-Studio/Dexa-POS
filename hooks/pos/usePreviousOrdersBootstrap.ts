import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useEffect, useRef } from "react";

/**
 * Loads location history once when POS is ready (aligned with useOrdersQuery location).
 * Coalesces with tab-mounted refresh via refreshPreviousOrders throttling + in-flight dedupe.
 */
export function usePreviousOrdersBootstrap(params: {
  locationId: string | null | undefined;
  enabled: boolean;
}) {
  const { locationId, enabled } = params;
  const bootstrappedForLocation = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      bootstrappedForLocation.current = null;
      return;
    }
    if (!locationId) return;
    if (bootstrappedForLocation.current === locationId) return;
    bootstrappedForLocation.current = locationId;
    void usePreviousOrdersStore.getState().refreshPreviousOrders();
  }, [enabled, locationId]);
}
