import type { KioskTemplateProps } from "@/components/kiosk/KioskTemplateRouter";
import { KioskCartButton } from "@/components/kiosk/shared/KioskCartButton";
import { KioskHeader } from "@/components/kiosk/shared/KioskHeader";
import { KioskIdleModal } from "@/components/kiosk/shared/KioskIdleModal";
import { KioskOrderTypeScreen } from "@/components/kiosk/shared/KioskOrderTypeScreen";
import { KioskCartView } from "@/components/kiosk/shared/KioskCartView";
import { KioskScreenTransition } from "@/components/kiosk/shared/KioskScreenTransition";
import { useKioskIdleTimer } from "@/components/kiosk/shared/useKioskIdleTimer";
import { KioskCheckoutView } from "@/components/kiosk/template-a/KioskCheckoutView";
import { KioskItemDetail } from "@/components/kiosk/template-a/KioskItemDetail";
import { KioskMenuViewB } from "@/components/kiosk/template-b/KioskMenuViewB";
import type { MenuItemType } from "@/lib/types";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

/**
 * Template B — its own ordering flow and layout.
 *
 * Screen sequence: orderType → menu → itemDetail → cart → checkout → confirmation,
 * same shape as Template A. The differentiation is media: the idle/attract
 * screen (see KioskAttractCarouselB, wired in app/(main)/kiosk.tsx) is an
 * image+video carousel, and the menu screen (KioskMenuViewB) adds a hero
 * image banner above the category rail. Checkout/item-detail/cart are shared
 * with Template A — no template-specific behavior needed there yet.
 */
export type TemplateBScreen =
  | "orderType"
  | "menu"
  | "itemDetail"
  | "cart"
  | "checkout"
  | "confirmation";

export function KioskTemplateB({ config, onExit }: KioskTemplateProps) {
  const [screen, setScreen] = useState<TemplateBScreen>("orderType");
  const [selectedItem, setSelectedItem] = useState<MenuItemType | null>(null);
  const [paid, setPaid] = useState(false);
  const itemCount = useKioskCartStore((s) => s.itemCount());
  const subtotal = useKioskCartStore((s) => s.subtotal());
  const orderType = useKioskCartStore((s) => s.orderType);
  const setOrderType = useKioskCartStore((s) => s.setOrderType);
  const clearCart = useKioskCartStore((s) => s.clear);

  const hasActiveCart = !paid && (itemCount > 0 || screen === "checkout");

  const resetToIdle = useCallback(() => {
    clearCart();
    setPaid(false);
    setScreen("orderType");
    setSelectedItem(null);
    onExit();
  }, [clearCart, onExit]);

  const handleIdleReset = resetToIdle;

  const { registerActivity, showWarning, secondsLeft } = useKioskIdleTimer({
    idleTimeoutSeconds: config.idleTimeoutSeconds,
    cartResetTimeoutSeconds: config.cartResetTimeoutSeconds,
    hasActiveCart,
    onReset: handleIdleReset,
  });

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

      {/* Body — one stacking context; screens fill it absolutely so an
          outgoing screen cross-fades over the incoming one instead of sharing
          the column with it. See KioskScreenTransition. */}
      <View style={{ flex: 1 }}>
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { display: screen === "menu" ? "flex" : "none" },
          ]}
        >
          <KioskScreenTransition key="menu" direction="fade">
            <KioskMenuViewB
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
