import { resolveOrderTypeFlow } from "@/lib/kiosk/orderTypeFlow";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import { kioskOrdering, type KioskConfig } from "@/types/kiosk";
import { useEffect } from "react";

/**
 * Shared entry flow for every template: whether the session opens on the
 * Dine-In / Takeaway question or straight on the menu, and which buttons the
 * question shows. Driven by the station's "Available Order Types" setting.
 *
 * Templates mount fresh per session (kiosk.tsx swaps them for the attract
 * screen when idle) and config only changes while idle, so the flow is fixed
 * for the life of a session. When the question is skipped the type is applied
 * to the cart on mount, since no screen will ever call setOrderType.
 */
export function useKioskOrderTypeFlow(config: KioskConfig) {
  const { autoType, options } = resolveOrderTypeFlow(kioskOrdering(config));
  const setOrderType = useKioskCartStore((s) => s.setOrderType);

  useEffect(() => {
    if (autoType) setOrderType(autoType);
  }, [autoType, setOrderType]);

  return {
    options,
    initialScreen: autoType ? ("menu" as const) : ("orderType" as const),
  };
}
