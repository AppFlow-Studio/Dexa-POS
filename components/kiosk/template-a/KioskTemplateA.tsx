import { KioskTemplateProps } from "@/components/kiosk/KioskTemplateRouter";
import { KioskCartButton } from "@/components/kiosk/shared/KioskCartButton";
import { KioskHeader } from "@/components/kiosk/shared/KioskHeader";
import { KioskOrderTypeScreen } from "@/components/kiosk/shared/KioskOrderTypeScreen";
import { KioskItemDetail } from "@/components/kiosk/template-a/KioskItemDetail";
import { KioskMenuView } from "@/components/kiosk/template-a/KioskMenuView";
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
  const subtotal = useKioskCartStore((s) => s.subtotal());
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

  return (
    <View className="flex-1" style={{ backgroundColor: config.backgroundColor }}>
      <KioskHeader
        config={config}
        orderType={orderType}
        onChangeOrderType={setOrderType}
        onExit={onExit}
      />

      {/* Body */}
      {screen === "menu" && (
        <View className="flex-1">
          <KioskMenuView
            config={config}
            onSelectItem={(item) => {
              setSelectedItem(item);
              setScreen("itemDetail");
            }}
          />
          <KioskCartButton
            config={config}
            itemCount={itemCount}
            subtotal={subtotal}
            onPress={() => setScreen("cart")}
          />
        </View>
      )}

      {screen === "itemDetail" && selectedItem && (
        <KioskItemDetail
          config={config}
          item={selectedItem}
          onBack={() => setScreen("menu")}
          onAdded={() => setScreen("menu")}
        />
      )}

      {(screen === "cart" ||
        screen === "checkout" ||
        screen === "confirmation") && (
        <View className="flex-1 items-center justify-center px-8">
          <Text
            className="text-3xl font-bold"
            style={{ color: config.headerTextColor }}
          >
            {screen}
          </Text>
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
