import { useInventorySync } from "@/hooks/pos/useInventorySync";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { Slot, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import { Text, TouchableOpacity, View } from "react-native";

// Define the tabs for the inventory section
const INVENTORY_TABS = [
  { name: "Catalog", path: "/inventory" },
  { name: "Vendors", path: "/inventory/vendors" },
  { name: "Purchase Orders", path: "/inventory/purchase-orders" },
  { name: "Reports", path: "/inventory/reports" },
];

export default function InventoryLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const setInventoryData = useInventoryStore((s) => s.setInventoryData);
  const fetchPurchaseOrders = useInventoryStore((s) => s.fetchPurchaseOrders);

  const { data: inventoryData } = useInventorySync(selectedStore?.id ?? null);

  useEffect(() => {
    if (inventoryData) {
      setInventoryData({
        items: inventoryData.inventoryItems,
        vendors: inventoryData.vendors,
      });
    }
  }, [inventoryData, setInventoryData]);

  useEffect(() => {
    if (selectedStore?.id) {
      fetchPurchaseOrders(selectedStore.id);
    }
  }, [selectedStore?.id, fetchPurchaseOrders]);

  return (
    <View className="flex-1 p-4" style={{ backgroundColor: colors.screen }}>
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
