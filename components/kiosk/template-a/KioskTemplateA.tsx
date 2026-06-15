import { KioskTemplateProps } from "@/components/kiosk/KioskTemplateRouter";
import { KioskCartButton } from "@/components/kiosk/shared/KioskCartButton";
import { KioskHeader } from "@/components/kiosk/shared/KioskHeader";
import { KioskIdleModal } from "@/components/kiosk/shared/KioskIdleModal";
import { KioskOrderTypeScreen } from "@/components/kiosk/shared/KioskOrderTypeScreen";
import { KioskCartView } from "@/components/kiosk/shared/KioskCartView";
import { KioskScreenTransition } from "@/components/kiosk/shared/KioskScreenTransition";
import { useKioskIdleTimer } from "@/components/kiosk/shared/useKioskIdleTimer";
import { KioskCheckoutView } from "@/components/kiosk/template-a/KioskCheckoutView";
import { KioskItemDetail } from "@/components/kiosk/template-a/KioskItemDetail";
import { KioskMenuView } from "@/components/kiosk/template-a/KioskMenuView";
import type { MenuItemType } from "@/lib/types";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useCallback, useState } from "react";
import { View } from "react-native";

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
  const clearCart = useKioskCartStore((s) => s.clear);

  // Anything to lose? Items in the cart, or already mid-checkout (a real
  // order has been created and needs voiding on reset).
  const hasActiveCart = itemCount > 0 || screen === "checkout";

  const handleIdleReset = useCallback(() => {
    const activeOrderId = useOrderStore.getState().activeOrderId;
    if (activeOrderId) {
      try {
        useOrderStore.getState().voidOrder(activeOrderId);
      } catch (err) {
        console.error("[kiosk] idle reset: void order failed:", err);
      }
    }
    clearCart();
    setScreen("orderType");
    setSelectedItem(null);
    onExit();
  }, [clearCart, onExit]);

  const { registerActivity, showWarning, secondsLeft } = useKioskIdleTimer({
    idleTimeoutSeconds: config.idleTimeoutSeconds,
    cartResetTimeoutSeconds: config.cartResetTimeoutSeconds,
    hasActiveCart,
    onReset: handleIdleReset,
  });

  // First step: choose Dine In / Takeaway. Full-screen takeover (no header).
  if (screen === "orderType") {
    return (
      <View className="flex-1" onTouchStart={registerActivity}>
        <KioskScreenTransition>
          <KioskOrderTypeScreen
            config={config}
            onSelect={(type) => {
              setOrderType(type);
              setScreen("menu");
            }}
          />
        </KioskScreenTransition>
      </View>
    );
  }

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: config.backgroundColor }}
      onTouchStart={registerActivity}
    >
      {/* Header hidden during checkout — that flow has created a real order, so
          the only exit is its in-screen Back, which voids the order. */}
      {screen !== "checkout" && (
        <KioskHeader
          config={config}
          orderType={orderType}
          onChangeOrderType={setOrderType}
          onExit={onExit}
        />
      )}

      {showWarning && (
        <KioskIdleModal
          config={config}
          secondsLeft={secondsLeft}
          onContinue={registerActivity}
        />
      )}

      {/* Body */}
      {screen === "menu" && (
        <KioskScreenTransition key="menu">
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
        </KioskScreenTransition>
      )}

      {screen === "itemDetail" && selectedItem && (
        <KioskScreenTransition key="itemDetail">
          <KioskItemDetail
            config={config}
            item={selectedItem}
            onBack={() => setScreen("menu")}
            onAdded={() => setScreen("menu")}
          />
        </KioskScreenTransition>
      )}

      {screen === "cart" && (
        <KioskScreenTransition key="cart">
          <KioskCartView
            config={config}
            onBack={() => setScreen("menu")}
            onCheckout={() => setScreen("checkout")}
          />
        </KioskScreenTransition>
      )}

      {screen === "checkout" && (
        <KioskScreenTransition key="checkout">
          <KioskCheckoutView
            config={config}
            onBack={() => setScreen("cart")}
            onDone={onExit}
          />
        </KioskScreenTransition>
      )}
    </View>
  );
}
