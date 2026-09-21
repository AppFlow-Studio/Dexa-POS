import type { CartItem, MenuItemType, ModifierCategory } from "@/lib/types";
import type { ModifierSelection } from "@/stores/useModifierSelectionStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useOrderStore } from "@/stores/useOrderStore";

/** What the options sheet hands back: the same inputs ModifierScreen saves. */
export interface ItemDraft {
  item: MenuItemType;
  categoryId: string | null;
  menuId: string | null;
  quantity: number;
  isToGo: boolean;
  groups: ModifierCategory[];
  selections: ModifierSelection;
  /** ModifierScreen's special instructions, kept in `customizations.notes`. */
  notes: string;
  /** The seat chosen on the menu page; null = shared, undefined = not a table check. */
  seatNumber?: number | null;
}

type Modifiers = NonNullable<CartItem["customizations"]["modifiers"]>;

/** The selection map ModifierScreen's edit mode starts from: what the line already has. */
export function selectionsOf(item: CartItem, groups: ModifierCategory[]): ModifierSelection {
  const result: ModifierSelection = {};
  for (const group of groups) result[group.id] = {};
  for (const group of item.customizations.modifiers ?? []) {
    const picks: ModifierSelection[string] = {};
    for (const option of group.options) picks[option.id] = option.isNo ? "no" : true;
    result[group.categoryId] = picks;
  }
  return result;
}

/** Selected options per group, in the register's `customizations.modifiers` shape. */
export function selectedModifiers(groups: ModifierCategory[], selections: ModifierSelection): Modifiers {
  const result: Modifiers = [];
  for (const group of groups) {
    const picked = selections[group.id] ?? {};
    const options = group.options
      .filter((o) => picked[o.id] === true || picked[o.id] === "no")
      .map((o) => ({
        id: o.id,
        name: o.name,
        price: picked[o.id] === "no" ? 0 : o.price,
        isNo: picked[o.id] === "no" ? true : undefined,
      }));
    if (options.length) result.push({ categoryId: group.id, categoryName: group.name, options });
  }
  return result;
}

/** Required groups with nothing chosen — the sheet refuses to add until empty. */
export function unsatisfiedRequired(groups: ModifierCategory[], selections: ModifierSelection): string[] {
  return groups
    .filter((g) => g.type === "required" && !Object.values(selections[g.id] ?? {}).some(Boolean))
    .map((g) => g.id);
}

/** Unit price with the chosen options, before quantity (ModifierScreen's computeSessionTotal / qty). */
export function unitPriceWithOptions(basePrice: number, groups: ModifierCategory[], selections: ModifierSelection): number {
  let total = basePrice;
  for (const group of selectedModifiers(groups, selections)) {
    for (const option of group.options) total += option.price;
  }
  return total;
}

/**
 * The CartItem ModifierScreen builds on Done, field for field. `item` is the
 * menu-tree copy (context price), which is what the menu rows hand over.
 */
export function buildMenuCartItem(draft: ItemDraft): CartItem {
  const { item, quantity, groups, selections } = draft;
  const customizations = { modifiers: selectedModifiers(groups, selections), notes: draft.notes.trim() };
  const cashPrice =
    item.cashPrice ?? useMenuStore.getState().getMenuItemById(item.id)?.cashPrice ?? item.price;
  const categoryName = draft.categoryId
    ? useMenuStore.getState().getCategoryById(draft.categoryId)?.name
    : undefined;
  const price = unitPriceWithOptions(item.price, groups, selections);
  return {
    id: useOrderStore.getState().generateCartItemId(item.id, customizations),
    menuItemId: item.id,
    name: item.name,
    quantity,
    originalPrice: cashPrice,
    unitPrice: item.price,
    price,
    // The store's recalculation owns these; ModifierScreen leaves them off
    // (its item is untyped), OpenItemAdder zeroes them. Same starting point.
    subtotal: price * quantity,
    cashSubtotal: cashPrice * quantity,
    taxRate: 0,
    taxAmount: 0,
    cashTaxAmount: 0,
    image: item.image,
    cashPrice,
    customizations,
    availableDiscount: item.availableDiscount,
    appliedDiscount: null,
    paidQuantity: 0,
    isDraft: false,
    is_to_go: draft.isToGo,
    seatNumber: draft.seatNumber,
    addedFromCategoryId: draft.categoryId,
    addedFromMenuId: draft.menuId,
    category_name: categoryName,
    baseCardPrice: item.price,
    baseCashPrice: item.cashPrice ?? item.price,
  };
}

/**
 * The line after "Save" on an existing item: what ModifierScreen's edit
 * commit writes (quantity, to-go, options, re-priced from the line's own
 * base price). Same id, so `updateItemInActiveOrder` replaces in place and
 * the store's recalculation owns the totals.
 */
export function withOptions(existing: CartItem, draft: ItemDraft): CartItem {
  const base = existing.baseCardPrice ?? existing.unitPrice ?? existing.price;
  const price = unitPriceWithOptions(base, draft.groups, draft.selections);
  return {
    ...existing,
    quantity: draft.quantity,
    price,
    subtotal: price * draft.quantity,
    customizations: {
      ...existing.customizations,
      modifiers: selectedModifiers(draft.groups, draft.selections),
      notes: draft.notes.trim(),
    },
    is_to_go: draft.isToGo,
    isDraft: false,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The open-item CartItem OpenItemAdder builds: the entered price is the cash
 * price, and dual pricing lifts the card price by the location's percentage.
 */
export function buildOpenCartItem(input: {
  name: string;
  price: number;
  taxable: boolean;
  isToGo: boolean;
  dualPricingPct: number | null;
  seatNumber?: number | null;
}): CartItem {
  const { name, price, dualPricingPct } = input;
  const cardPrice = dualPricingPct ? round2(price * (1 + dualPricingPct / 100)) : price;
  const id = `open_item_${Date.now()}`;
  return {
    id,
    menuItemId: id,
    name,
    quantity: 1,
    originalPrice: price,
    baseCashPrice: price,
    price: cardPrice,
    unitPrice: cardPrice,
    baseCardPrice: cardPrice,
    cashPrice: price,
    customizations: { notes: "", modifiers: undefined },
    availableDiscount: undefined,
    appliedDiscount: null,
    is_open_item: true,
    open_item_name: name,
    open_item_price: cardPrice,
    is_to_go: input.isToGo,
    seatNumber: input.seatNumber,
    category_name: "Open Items",
    is_tax_exempt: !input.taxable,
    paidQuantity: 0,
    subtotal: cardPrice,
    cashSubtotal: price,
    taxRate: 0,
    taxAmount: 0,
    cashTaxAmount: 0,
    discount_amount: 0,
    discount_cash_amount: 0,
  };
}
