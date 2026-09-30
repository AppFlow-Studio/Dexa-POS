import OnlineOrderDrawer from "@/components/online-orders/OnlineOrderDrawer";
import OnlineOrderEdgeTab from "@/components/online-orders/OnlineOrderEdgeTab";
import { shouldShowOnlineOrdersButton } from "@/lib/kds/flowMode";
import { usePendingOnlineOrderCount } from "@/stores/selectors/orderSelectors";
import { useKDSStore } from "@/stores/useKDSStore";
import { useOnlineOrderDrawerStore } from "@/stores/useOnlineOrderDrawerStore";
import React, { useEffect } from "react";

/**
 * Online-orders edge tab + drawer on a KDS. A display can turn it off
 * (kds_displays.show_online_orders_button), but it stays while the location
 * needs manual accepts or any online order is pending — see
 * shouldShowOnlineOrdersButton. kdsMode hides the POS-only navigation.
 */
export default function KdsOnlineOrders() {
  const setting = useKDSStore(
    (s) => s.kdsDisplayConfig?.showOnlineOrdersButton ?? true,
  );
  const acceptConfig = useKDSStore((s) => s.onlineAcceptConfig);
  const pendingCount = usePendingOnlineOrderCount();
  const visible = shouldShowOnlineOrdersButton(
    setting,
    acceptConfig,
    pendingCount,
  );

  // Hidden while open (setting switched off): close it, or the drawer would
  // come back open the next time the button appears.
  useEffect(() => {
    if (!visible) useOnlineOrderDrawerStore.getState().closeDrawer();
  }, [visible]);

  if (!visible) return null;
  return (
    <>
      <OnlineOrderEdgeTab />
      <OnlineOrderDrawer kdsMode />
    </>
  );
}
