import PaymentBottomSheet from "@/components/bill/PaymentBottomSheet";
import { LocationRealtimeProvider } from "@/contexts/LocationRealtimeProvider";
import { useOrderSyncRecovery } from "@/hooks/pos/useOrderSyncRecovery";
import { isHandheldStationType } from "@/lib/stationType";
import { FixedUiScaleProvider } from "@/lib/uiScale";
import { hydrateDrawerSession } from "@/services/cashDrawerService";
import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import React, { useEffect } from "react";

type RealtimeCallbacks = NonNullable<
  React.ComponentProps<typeof LocationRealtimeProvider>["callbacks"]
>;

/** Side-effect component: keeps POS orders in sync when realtime drops */
function OrderSyncRecoveryBridge({ locationId }: { locationId: string }) {
  useOrderSyncRecovery(locationId);
  return null;
}

/**
 * The register's runtime, shared by the tablet register screens and the
 * handheld root (docs/features/handheld/README.md). Moved verbatim out of
 * app/(main)/_layout.tsx so a handheld station can swap the screens without
 * leaving the tree these subsystems start in:
 *   - LocationRealtimeProvider — live order / payment / session updates
 *   - OrderSyncRecoveryBridge — re-sync when realtime drops
 *   - cash-drawer session hydration on boot
 *   - PaymentBottomSheet — a native Modal, so its tree position is free
 *
 * What deliberately stays in MainLayout, and why:
 *   - handleOrderChange / handlePaymentChange and the KDSSoundService they
 *     play through: the kiosk branch shares them, so they are passed in.
 *   - useTableSessionInit: runs for every non-KDS station in MainLayout,
 *     which the handheld route also passes through.
 *   - PaymentDetailBottomSheet: an absolute-positioned z-index sibling of the
 *     register chrome (below the online-order tab at 150 and MenuSearchSheet
 *     at 200); moving it would change layering.
 *   - the offline outbox: lives in PosSyncProvider at the root.
 */
export function RegisterRuntime({
  locationId,
  callbacks,
  children,
}: {
  locationId: string;
  callbacks: RealtimeCallbacks;
  children: React.ReactNode;
}) {
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);

  useEffect(() => {
    if (!selectedStation || !selectedStore) return;
    const supabase = getOrderStoreSupabaseClient();
    if (!supabase) return;
    hydrateDrawerSession(supabase, selectedStation.id, selectedStore.id)
      .then((hasSession) => {
        const store =
          require("@/stores/useCashDrawerStore").useCashDrawerStore.getState();
        if (!hasSession && store.drawerId) {
          store.setShouldPromptOpen(true);
        }
      })
      .catch((err) => {
        console.warn("[MainLayout] Cash drawer hydration failed:", err);
      });
  }, [selectedStation?.id, selectedStore?.id]);

  // The sheet is a native Modal mounted as a SIBLING of {children}, i.e.
  // above the handheld's own HandheldFrame. HandheldFrame pins `--ui-scale`
  // to 1 through a NativeWind vars() React context, which therefore never
  // reaches the sheet: on a 360x720dp handheld it computes its own scale,
  // min(360/1333, 720/752) = 0.27, clamped to the 0.6 floor, and renders its
  // title at 14px and its CLOSE label at 8px. Wave 4a's own payment screens
  // are handheld-native, but this sheet still carries the crash-recovery
  // "verifying" surface — the one screen where an operator has to read a
  // dollar amount and decide whether a card was charged.
  //
  // The provider is rendered unconditionally with a nullable scale, never
  // branched on: swapping the element shape when the station flips remounts
  // the subtree, which is how the root Stack lost a queued navigation once
  // before ("PUSH was not handled by any navigator").
  //
  // fill={false} is load-bearing: the default wraps children in a flex-1
  // View, which here would sit in the same column as {children} and take
  // half the screen from the app.
  const paymentScale = isHandheldStationType(selectedStation?.station_type) ? 1 : null;

  return (
    <LocationRealtimeProvider locationId={locationId} callbacks={callbacks}>
      <OrderSyncRecoveryBridge locationId={locationId} />
      {children}
      <FixedUiScaleProvider scale={paymentScale} fill={false} pointerEvents="box-none">
        <PaymentBottomSheet />
      </FixedUiScaleProvider>
    </LocationRealtimeProvider>
  );
}
