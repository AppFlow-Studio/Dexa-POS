import type { KioskCartItem, KioskCartTotals } from "@/components/kiosk/types";

export function roundMoney(value: number): number {
  return Math.trunc((value + Number.EPSILON) * 100) / 100;
}

export function getCartItemUnitPrice(item: KioskCartItem): number {
  return roundMoney(
    item.basePrice + item.modifiers.reduce((sum, modifier) => sum + modifier.price, 0),
  );
}

export function getCartItemSubtotal(item: KioskCartItem): number {
  return roundMoney(getCartItemUnitPrice(item) * item.quantity);
}

export function getCartTotals(items: KioskCartItem[], tipPercent: number): KioskCartTotals {
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + getCartItemSubtotal(item), 0),
  );
  const tip = roundMoney(subtotal * (tipPercent / 100));
  return {
    subtotal,
    tip,
    total: roundMoney(subtotal + tip),
  };
}

export function formatMoney(value: number): string {
  return `$${roundMoney(value).toFixed(2)}`;
}
