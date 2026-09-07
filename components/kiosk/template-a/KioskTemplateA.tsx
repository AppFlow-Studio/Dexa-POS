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
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

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
  // Set once the checkout reaches the paid/success screen. The order is settled,
  // so the idle timer must NOT treat it as an active cart (which would reset
  // under a customer reading their pickup number).
  const [paid, setPaid] = useState(false);
  const itemCount = useKioskCartStore((s) => s.itemCount());
  const subtotal = useKioskCartStore((s) => s.subtotal());
  const orderType = useKioskCartStore((s) => s.orderType);
  const setOrderType = useKioskCartStore((s) => s.setOrderType);
  const clearCart = useKioskCartStore((s) => s.clear);

  // Anything to lose? Items in the cart, or mid-checkout with an unpaid order.
  // Once paid, there's nothing to void — the success screen owns its own 10s
  // auto-return, so we drop out of "active cart" to stop the idle timer voiding
  // a settled order.
  const hasActiveCart = !paid && (itemCount > 0 || screen === "checkout");

  const resetToIdle = useCallback(() => {
    clearCart();
    setPaid(false);
    setScreen("orderType");
    setSelectedItem(null);
    onExit();
  }, [clearCart, onExit]);

  // Idle/walk-away. No backend order exists until the customer pays (creation is
  // deferred to payOrder), so there's nothing to void here — just reset.
  const handleIdleReset = resetToIdle;

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
        <KioskScreenTransition direction="fade">
          <KioskOrderTypeScreen
            config={config}
            onSelect={(type) => {
              setOrderType(type);
              setScreen("menu");
            }}
          />
        </KioskScreenTransition>
        {showWarning && (
          <KioskIdleModal
            config={config}
            secondsLeft={secondsLeft}
            onContinue={registerActivity}
            hasActiveCart={hasActiveCart}
          />
        )}
      </View>
    );
  }

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: config.backgroundColor }}
      onTouchStart={registerActivity}
    >
      {/* Header hidden during checkout — that flow owns its own in-screen Back. */}
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
          hasActiveCart={hasActiveCart}
        />
      )}

      {/* Body — a single stacking context. Every screen fills it absolutely
          (see KioskScreenTransition) so an outgoing screen fades out *over* the
          incoming one rather than sharing the column with it for the length of
          its exit animation. */}
      <View style={{ flex: 1 }}>
        {/* Menu stays mounted across itemDetail navigation so the category rail
            and item grid keep their scroll position when an item is added and
            the customer is returned to the menu (see onAdded below). */}
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { display: screen === "menu" ? "flex" : "none" },
          ]}
        >
          <KioskScreenTransition key="menu" direction="fade">
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
        </View>

        {screen === "itemDetail" && selectedItem && (
          <KioskScreenTransition key="itemDetail" direction="forward">
            <KioskItemDetail
              config={config}
              item={selectedItem}
              onBack={() => setScreen("menu")}
              onAdded={() => setScreen("menu")}
            />
          </KioskScreenTransition>
        )}

        {screen === "cart" && (
          <KioskScreenTransition key="cart" direction="forward">
            <KioskCartView
              config={config}
              onBack={() => setScreen("menu")}
              onCheckout={() => setScreen("checkout")}
            />
          </KioskScreenTransition>
        )}

        {screen === "checkout" && (
          <KioskScreenTransition key="checkout" direction="up">
            <KioskCheckoutView
              config={config}
              onBack={() => setScreen("cart")}
              onPaid={() => setPaid(true)}
              onDone={resetToIdle}
            />
          </KioskScreenTransition>
        )}
      </View>
    </View>
  );
}
