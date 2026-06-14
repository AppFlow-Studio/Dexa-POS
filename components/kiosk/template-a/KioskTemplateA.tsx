import { KioskTemplateProps } from "@/components/kiosk/KioskTemplateRouter";
import { KioskMenuView } from "@/components/kiosk/template-a/KioskMenuView";
import { KioskOrderTypeScreen } from "@/components/kiosk/shared/KioskOrderTypeScreen";
import type { MenuItemType } from "@/lib/types";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

/**
 * Template A — its own ordering flow and layout.
 *
 * Screen sequence: orderType → menu → itemDetail → cart → checkout → confirmation.
 * The session opens on the Dine In / Takeaway choice; the menu is a two-pane
 * split (category rail + item grid) whose ratio follows config.orientation
 * (1/4·3/4 horizontal, 1/3·2/3 vertical).
 *
 * Browses against the local useKioskCartStore; the cart converts to a real
 * order only at checkout. Logic with no layout opinion is pulled from
 * components/kiosk/shared. `onExit` returns the kiosk to attract/idle.
 */
export type TemplateAScreen =
  | "orderType"
  | "menu"
  | "itemDetail"
  | "cart"
  | "checkout"
  | "confirmation";

export function KioskTemplateA({ config, onExit }: KioskTemplateProps) {
  const [screen, setScreen] = useState<TemplateAScreen>("orderType");
  const [selectedItem, setSelectedItem] = useState<MenuItemType | null>(null);
  const itemCount = useKioskCartStore((s) => s.itemCount());
  const orderType = useKioskCartStore((s) => s.orderType);
  const setOrderType = useKioskCartStore((s) => s.setOrderType);

  // First step: choose Dine In / Takeaway. Full-screen takeover (no header).
  if (screen === "orderType") {
    return (
      <KioskOrderTypeScreen
        config={config}
        onSelect={(type) => {
          setOrderType(type);
          setScreen("menu");
        }}
      />
    );
  }

  const orderTypeLabel = orderType === "dine_in" ? "Dine In" : "Takeaway";

  return (
    <View className="flex-1" style={{ backgroundColor: config.backgroundColor }}>
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-6 py-4"
        style={{ backgroundColor: config.primaryColor }}
      >
        <View className="flex-row items-center gap-4">
          <Text className="text-white text-lg font-semibold">
            {config.profileName}
          </Text>
          {/* Editable order-type chip — tap to change. */}
          <Pressable
            onPress={() => setScreen("orderType")}
            className="px-3 py-1 rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
          >
            <Text className="text-white text-sm font-medium">
              {orderTypeLabel} ▾
            </Text>
          </Pressable>
        </View>
        <View className="flex-row items-center gap-4">
          <Pressable onPress={() => setScreen("cart")}>
            <Text className="text-white font-semibold">Cart · {itemCount}</Text>
          </Pressable>
          <Pressable onPress={onExit}>
            <Text className="text-white/80">Cancel</Text>
          </Pressable>
        </View>
      </View>

      {/* Body */}
      {screen === "menu" && (
        <KioskMenuView
          config={config}
          onSelectItem={(item) => {
            setSelectedItem(item);
            setScreen("itemDetail");
          }}
        />
      )}

      {screen !== "menu" && (
        <View className="flex-1 items-center justify-center px-8">
          <Text
            className="text-3xl font-bold"
            style={{ color: config.headerTextColor }}
          >
            {screen}
          </Text>
          {selectedItem && (
            <Text className="mt-2" style={{ color: config.textColor }}>
              {selectedItem.name}
            </Text>
          )}
          <Pressable
            onPress={() => setScreen("menu")}
            className="mt-10 px-6 py-3 rounded-full"
            style={{ backgroundColor: config.primaryColor }}
          >
            <Text className="text-white font-semibold">Back to menu</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
