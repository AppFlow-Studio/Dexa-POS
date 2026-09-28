import type { KioskTemplateProps } from "@/components/kiosk/KioskTemplateRouter";
import { KioskCartButton } from "@/components/kiosk/shared/KioskCartButton";
import { KioskConfirmDialog } from "@/components/kiosk/shared/KioskConfirmDialog";
import { KioskHeader } from "@/components/kiosk/shared/KioskHeader";
import { KioskIdleModal } from "@/components/kiosk/shared/KioskIdleModal";
import { KioskItemDetailModal } from "@/components/kiosk/shared/KioskItemDetailModal";
import { kioskCartPlacement } from "@/components/kiosk/shared/kioskLayout";
import { kioskStrings } from "@/components/kiosk/shared/kioskStrings";
import { KioskOrderTypeScreen } from "@/components/kiosk/shared/KioskOrderTypeScreen";
import { KioskCartView } from "@/components/kiosk/shared/KioskCartView";
import { KioskScreenTransition } from "@/components/kiosk/shared/KioskScreenTransition";
import { useKioskIdleTimer } from "@/components/kiosk/shared/useKioskIdleTimer";
import { useKioskMenuSearchState } from "@/components/kiosk/shared/useKioskMenuSearchState";
import { KioskCheckoutView } from "@/components/kiosk/template-a/KioskCheckoutView";
import { KioskMenuViewC } from "@/components/kiosk/template-c/KioskMenuViewC";
import type { MenuItemType } from "@/lib/types";
import {
  useKioskCartStore,
  type KioskItemSource,
} from "@/stores/useKioskCartStore";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

/**
 * Template C — its own ordering flow and layout.
 *
 * Screen sequence: orderType → menu → itemDetail → cart → checkout → confirmation,
 * same shape as Templates A/B. Differentiation from B is entirely in the menu
 * screen (KioskMenuViewC): the same media carousel banner sits under the
 * header, but categories are a horizontal scrollable pill bar (not a
 * sidebar), and items render as full-width rows in one scrollable list
 * grouped by category, instead of a grid. Checkout/item-detail/cart are
 * shared with Templates A/B — no template-specific behavior needed there yet.
 */
export type TemplateCScreen =
  | "orderType"
  | "menu"
  | "itemDetail"
  | "cart"
  | "checkout"
  | "confirmation";

export function KioskTemplateC({ config, onExit }: KioskTemplateProps) {
  const [screen, setScreen] = useState<TemplateCScreen>("orderType");
  const [selectedItem, setSelectedItem] = useState<MenuItemType | null>(null);
  const [selectedSource, setSelectedSource] = useState<KioskItemSource>();
  const [paid, setPaid] = useState(false);
  // Start Over with something in the basket asks first; empty, it just goes.
  const [confirmingStartOver, setConfirmingStartOver] = useState(false);
  const itemCount = useKioskCartStore((s) => s.itemCount());
  const subtotal = useKioskCartStore((s) => s.subtotal());
  const setOrderType = useKioskCartStore((s) => s.setOrderType);
  const clearCart = useKioskCartStore((s) => s.clear);

  const hasActiveCart = !paid && (itemCount > 0 || screen === "checkout");

  const resetToIdle = useCallback(() => {
    clearCart();
    setPaid(false);
    setConfirmingStartOver(false);
    setScreen("orderType");
    setSelectedItem(null);
    onExit();
  }, [clearCart, onExit]);

  const handleIdleReset = resetToIdle;

  // Start Over is the customer's way out, and it is the same reset the idle
  // timer performs — one path, so the two can never clear different things.
  // The menu view's own state (search, selected category) goes with the
  // unmount when the session ends.
  const handleStartOver = useCallback(() => {
    if (itemCount > 0) {
      setConfirmingStartOver(true);
      return;
    }
    resetToIdle();
  }, [itemCount, resetToIdle]);

  // One cart, one place: the header in landscape, the floating button in
  // portrait. Never both, and never over a tile.
  const cartPlacement = kioskCartPlacement(config.orientation === "vertical");

  const { registerActivity, showWarning, secondsLeft } = useKioskIdleTimer({
    idleTimeoutSeconds: config.idleTimeoutSeconds,
    cartResetTimeoutSeconds: config.cartResetTimeoutSeconds,
    hasActiveCart,
    onReset: handleIdleReset,
  });

  // Search is owned here because two children need it: the header draws the
  // field, the menu view draws the results over its grid. Typing is the one
  // interaction the idle timer cannot see for itself — it counts touches, and
  // a software keyboard produces none.
  const search = useKioskMenuSearchState(registerActivity);

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
          onStartOver={handleStartOver}
          search={
            screen === "menu"
              ? {
                  expanded: search.expanded,
                  query: search.query,
                  onExpand: search.open,
                  onChangeQuery: search.setQuery,
                  onClose: search.close,
                }
              : undefined
          }
          cart={
            cartPlacement === "header"
              ? {
                  itemCount,
                  subtotal,
                  onPress: () => setScreen("cart"),
                }
              : undefined
          }
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
            {
              display:
                screen === "menu" || screen === "itemDetail" ? "flex" : "none",
            },
          ]}
        >
          <KioskScreenTransition key="menu" direction="fade">
            <KioskMenuViewC
              config={config}
              search={search}
              onSelectItem={(item, source) => {
                setSelectedItem(item);
                setSelectedSource(source);
                setScreen("itemDetail");
              }}
            />
            {cartPlacement === "bottomBar" ? (
              <KioskCartButton
                config={config}
                itemCount={itemCount}
                subtotal={subtotal}
                onPress={() => setScreen("cart")}
              />
            ) : null}
          </KioskScreenTransition>
        </View>

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

      {/* Overlays sit outside the body, so their scrim covers the header too —
          nothing behind a popup stays tappable. Declared last so they stack
          above everything on both platforms. */}
      {screen === "itemDetail" && selectedItem && (
        <KioskItemDetailModal
          config={config}
          item={selectedItem}
          source={selectedSource}
          onDismiss={() => setScreen("menu")}
          onAdded={() => setScreen("menu")}
        />
      )}

      {confirmingStartOver && (
        <KioskConfirmDialog
          config={config}
          title={kioskStrings.startOverConfirmTitle}
          body={kioskStrings.startOverConfirmBody}
          cancelLabel={kioskStrings.startOverKeep}
          confirmLabel={kioskStrings.startOverConfirm}
          onCancel={() => setConfirmingStartOver(false)}
          onConfirm={resetToIdle}
        />
      )}
    </View>
  );
}
