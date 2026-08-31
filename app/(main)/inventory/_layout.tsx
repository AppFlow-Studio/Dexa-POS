import InventoryStaleBanner from "@/components/inventory/InventoryStaleBanner";
import { useInventorySync } from "@/hooks/pos/useInventorySync";
import {
  readInventorySnapshot,
  writeInventorySnapshot,
} from "@/lib/db/descriptors/inventory";
import { stationKind } from "@/lib/db/policy";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { Slot, usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

// Define the tabs for the inventory section
const INVENTORY_TABS = [
  { name: "Catalog", path: "/inventory" },
  { name: "Vendors", path: "/inventory/vendors" },
  { name: "Purchase Orders", path: "/inventory/purchase-orders" },
  { name: "Reports", path: "/inventory/reports" },
];

/**
 * Phase 5 mirror flag. Off = the section behaves exactly as it did, so rollback
 * is unsetting one env var.
 */
const LOCAL_INVENTORY_ENABLED =
  process.env.EXPO_PUBLIC_LOCAL_INVENTORY === "1";

export default function InventoryLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const setInventoryData = useInventoryStore((s) => s.setInventoryData);
  const fetchPurchaseOrders = useInventoryStore((s) => s.fetchPurchaseOrders);

  const locationId = selectedStore?.id ?? null;
  const {
    data: inventoryData,
    isFetching,
    isError,
    refetch,
  } = useInventorySync(locationId);

  // True while the catalog on screen came off disk rather than the network.
  const [isFromMirror, setIsFromMirror] = useState(false);
  // Set the moment live data lands, so a slow mirror read can never overwrite
  // a fresher live payload — the read is an accelerator, never an authority.
  const liveDataApplied = useRef(false);

  useEffect(() => {
    liveDataApplied.current = false;
    setIsFromMirror(false);
  }, [locationId]);

  // Paint from the mirror first. The live query is already in flight; this only
  // wins the race when the network is slow or absent, which is the entire point.
  useEffect(() => {
    if (!LOCAL_INVENTORY_ENABLED || !locationId) return;
    let cancelled = false;

    (async () => {
      const snapshot = await readInventorySnapshot(locationId);
      if (cancelled || !snapshot || liveDataApplied.current) return;
      setInventoryData({
        items: snapshot.inventoryItems,
        vendors: snapshot.vendors,
      });
      setIsFromMirror(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [locationId, setInventoryData]);

  useEffect(() => {
    if (!inventoryData) return;

    liveDataApplied.current = true;
    setIsFromMirror(false);
    setInventoryData({
      items: inventoryData.inventoryItems,
      vendors: inventoryData.vendors,
    });

    // Mirror the RAW rows this payload was mapped from, at the seam where they
    // have already arrived — one fetch, one cadence, no duplicated round trip.
    // Fire-and-forget: a mirror failure costs the next entry's offline paint,
    // never the catalog on screen right now.
    if (LOCAL_INVENTORY_ENABLED && locationId) {
      void writeInventorySnapshot(
        stationKind(selectedStation?.station_type),
        locationId,
        inventoryData.raw,
      );
    }
  }, [inventoryData, locationId, selectedStation?.station_type, setInventoryData]);

  useEffect(() => {
    if (selectedStore?.id) {
      fetchPurchaseOrders(selectedStore.id);
    }
  }, [selectedStore?.id, fetchPurchaseOrders]);

  return (
    <View className="flex-1 p-4" style={{ backgroundColor: colors.screen }}>
      {LOCAL_INVENTORY_ENABLED && (
        <InventoryStaleBanner
          isSyncing={isFetching}
          isFromMirror={isFromMirror}
          isError={isError}
          onRetry={() => {
            void refetch();
          }}
        />
      )}

      {/* Header with Navigation Tabs */}
      <View className="flex-row items-center mb-4">
        <View
          className="flex-row items-center"
          style={{
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: s(10),
            padding: s(4),
          }}
        >
          {INVENTORY_TABS.map((tab) => {
            const isActive = tab.path.split("/")[2] === pathname.split("/")[2];
            return (
              <TouchableOpacity
                key={tab.name}
                onPress={() => router.push(tab.path as any)}
                style={{
                  paddingHorizontal: s(14),
                  paddingVertical: s(8),
                  borderBottomWidth: isActive ? 2 : 0,
                  borderBottomColor: isActive ? colors.teal : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: s(13),
                    fontWeight: "600",
                    color: isActive ? colors.teal : colors.label,
                  }}
                >
                  {tab.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Renders the currently active screen (index.tsx, vendors.tsx, etc.) */}
      <View style={{ flex: 1, backgroundColor: colors.screen }}>
        <Slot />
      </View>
    </View>
  );
}
