import { getCartTotals } from "@/components/kiosk/cartMath";
import type {
  KioskCartItem,
  KioskCartModifier,
  KioskFlowContextValue,
  KioskMenuItem,
  KioskOrderType,
  KioskScreen,
} from "@/components/kiosk/types";
import type { KioskProfile } from "@/hooks/kiosk/useKioskProfile";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const KioskFlowContext = createContext<KioskFlowContextValue | null>(null);

const TEMPLATE_SEQUENCE: KioskProfile["template_id"][] = [
  "template_a",
  "template_b",
  "template_c",
];

function createCartItemId(
  item: KioskMenuItem,
  modifiers: KioskCartModifier[],
): string {
  const modifierKey = modifiers
    .map((modifier) => `${modifier.groupId}:${modifier.optionId}`)
    .sort()
    .join("|");
  return `${item.id}:${modifierKey || "base"}`;
}

export function KioskFlowProvider({
  profileTemplateId,
  children,
}: {
  profileTemplateId: KioskProfile["template_id"] | null | undefined;
  children: React.ReactNode;
}) {
  const [screen, setScreen] = useState<KioskScreen>("attract");
  const [orderType, setOrderTypeState] = useState<KioskOrderType | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<KioskMenuItem | null>(null);
  const [cartItems, setCartItems] = useState<KioskCartItem[]>([]);
  const [tipPercent, setTipPercent] = useState(0);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [templateOverride, setTemplateOverride] =
    useState<KioskProfile["template_id"] | null>(null);

  const templateId = templateOverride ?? profileTemplateId ?? "template_a";
  const totals = useMemo(() => getCartTotals(cartItems, tipPercent), [cartItems, tipPercent]);

  const setOrderType = useCallback((nextOrderType: KioskOrderType) => {
    setOrderTypeState(nextOrderType);
    setScreen("menu");
  }, []);

  const openItem = useCallback((item: KioskMenuItem) => {
    setSelectedItem(item);
    setScreen("itemDetail");
  }, []);

  const closeItem = useCallback(() => {
    setSelectedItem(null);
    setScreen("menu");
  }, []);

  const addCartItem = useCallback(
    (item: KioskMenuItem, quantity: number, modifiers: KioskCartModifier[]) => {
      const cartItemId = createCartItemId(item, modifiers);
      setCartItems((currentItems) => {
        const existingItem = currentItems.find((cartItem) => cartItem.id === cartItemId);
        if (existingItem) {
          return currentItems.map((cartItem) =>
            cartItem.id === cartItemId
              ? { ...cartItem, quantity: cartItem.quantity + quantity }
              : cartItem,
          );
        }
        return [
          ...currentItems,
          {
            id: cartItemId,
            menuItemId: item.id,
            name: item.name,
            image: item.image,
            basePrice: item.price,
            quantity,
            modifiers,
          },
        ];
      });
      setSelectedItem(null);
      setScreen("cart");
    },
    [],
  );

  const removeCartItem = useCallback((cartItemId: string) => {
    setCartItems((currentItems) => currentItems.filter((cartItem) => cartItem.id !== cartItemId));
  }, []);

  const updateCartItemQuantity = useCallback((cartItemId: string, quantity: number) => {
    setCartItems((currentItems) =>
      quantity <= 0
        ? currentItems.filter((cartItem) => cartItem.id !== cartItemId)
        : currentItems.map((cartItem) =>
            cartItem.id === cartItemId ? { ...cartItem, quantity } : cartItem,
          ),
    );
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setTipPercent(0);
  }, []);

  const resetFlow = useCallback(() => {
    setScreen("attract");
    setOrderTypeState(null);
    setSelectedCategoryId(null);
    setSelectedItem(null);
    setCartItems([]);
    setTipPercent(0);
    setPhone("");
    setEmail("");
  }, []);

  const cycleTemplate = useCallback(() => {
    const currentIndex = TEMPLATE_SEQUENCE.indexOf(templateId);
    const nextTemplate = TEMPLATE_SEQUENCE[(currentIndex + 1) % TEMPLATE_SEQUENCE.length];
    setTemplateOverride(nextTemplate);
  }, [templateId]);

  const value = useMemo<KioskFlowContextValue>(
    () => ({
      screen,
      orderType,
      selectedCategoryId,
      selectedItem,
      cartItems,
      totals,
      tipPercent,
      phone,
      email,
      templateId,
      setScreen,
      setOrderType,
      setSelectedCategoryId,
      openItem,
      closeItem,
      addCartItem,
      removeCartItem,
      updateCartItemQuantity,
      clearCart,
      setTipPercent,
      setPhone,
      setEmail,
      resetFlow,
      cycleTemplate,
    }),
    [
      addCartItem,
      cartItems,
      clearCart,
      closeItem,
      cycleTemplate,
      email,
      openItem,
      orderType,
      phone,
      removeCartItem,
      resetFlow,
      screen,
      selectedCategoryId,
      selectedItem,
      setOrderType,
      templateId,
      tipPercent,
      totals,
      updateCartItemQuantity,
    ],
  );

  return <KioskFlowContext.Provider value={value}>{children}</KioskFlowContext.Provider>;
}

export function useKioskFlow(): KioskFlowContextValue {
  const value = useContext(KioskFlowContext);
  if (!value) {
    throw new Error("useKioskFlow must be used inside KioskFlowProvider");
  }
  return value;
}
