import { create } from "zustand";

/**
 * A single selected modifier option, mirroring the shape used by
 * `CartItem.customizations.modifiers[].options` so a kiosk cart line can be
 * converted into a real order item at checkout without remapping.
 */
export interface KioskCartModifierGroup {
  categoryId: string;
  categoryName: string;
  options: {
    id: string;
    name: string;
    price: number;
  }[];
}

/**
 * A line in the kiosk's local cart. The kiosk browses entirely in this
 * lightweight store; only at checkout is it converted into a real order via
 * useOrderStore. Cleared whenever the kiosk returns to idle/abandon.
 */
export interface KioskCartLine {
  /** Unique id for this cart line instance (not the menu item id). */
  lineId: string;
  menuItemId: string;
  name: string;
  image?: string;
  /** Base (card) price for one unit, before modifiers. */
  unitPrice: number;
  /** Base cash price for one unit, before modifiers. */
  cashUnitPrice: number;
  quantity: number;
  modifiers: KioskCartModifierGroup[];
  notes?: string;
}

/** Per-unit card price including selected modifiers. */
export function lineUnitPrice(line: KioskCartLine): number {
  const mods = line.modifiers.reduce(
    (sum, g) => sum + g.options.reduce((s, o) => s + o.price, 0),
    0,
  );
  return line.unitPrice + mods;
}

/** Per-unit cash price including selected modifiers (modifiers priced the same). */
export function lineCashUnitPrice(line: KioskCartLine): number {
  const mods = line.modifiers.reduce(
    (sum, g) => sum + g.options.reduce((s, o) => s + o.price, 0),
    0,
  );
  return line.cashUnitPrice + mods;
}

/** Card line total (unit incl. modifiers × quantity). */
export function lineTotal(line: KioskCartLine): number {
  return lineUnitPrice(line) * line.quantity;
}

/** Customer-selected fulfilment type, mapped to order_type at checkout. */
export type KioskOrderType = "dine_in" | "takeout";

interface KioskCartState {
  lines: KioskCartLine[];
  /** Null until the customer picks one on the order-type screen. */
  orderType: KioskOrderType | null;

  setOrderType: (type: KioskOrderType) => void;

  /** Add a fully-built line. Returns the generated lineId. */
  addLine: (line: Omit<KioskCartLine, "lineId">) => string;
  setQuantity: (lineId: string, quantity: number) => void;
  incQuantity: (lineId: string) => void;
  decQuantity: (lineId: string) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;

  /** Sum of all card line totals. */
  subtotal: () => number;
  /** Sum of all cash line totals. */
  cashSubtotal: () => number;
  /** Total number of units across all lines. */
  itemCount: () => number;
}

const genLineId = () =>
  `kline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const useKioskCartStore = create<KioskCartState>((set, get) => ({
  lines: [],
  orderType: null,

  setOrderType: (type) => set({ orderType: type }),

  addLine: (line) => {
    const lineId = genLineId();
    set((state) => ({ lines: [...state.lines, { ...line, lineId }] }));
    return lineId;
  },

  setQuantity: (lineId, quantity) => {
    if (quantity <= 0) {
      get().removeLine(lineId);
      return;
    }
    set((state) => ({
      lines: state.lines.map((l) =>
        l.lineId === lineId ? { ...l, quantity } : l,
      ),
    }));
  },

  incQuantity: (lineId) =>
    set((state) => ({
      lines: state.lines.map((l) =>
        l.lineId === lineId ? { ...l, quantity: l.quantity + 1 } : l,
      ),
    })),

  decQuantity: (lineId) => {
    const line = get().lines.find((l) => l.lineId === lineId);
    if (!line) return;
    get().setQuantity(lineId, line.quantity - 1);
  },

  removeLine: (lineId) =>
    set((state) => ({
      lines: state.lines.filter((l) => l.lineId !== lineId),
    })),

  clear: () => set({ lines: [], orderType: null }),

  subtotal: () => get().lines.reduce((sum, l) => sum + lineTotal(l), 0),

  cashSubtotal: () =>
    get().lines.reduce(
      (sum, l) => sum + lineCashUnitPrice(l) * l.quantity,
      0,
    ),

  itemCount: () => get().lines.reduce((sum, l) => sum + l.quantity, 0),
}));
