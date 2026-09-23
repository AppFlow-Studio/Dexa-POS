import { buildKioskCartLine } from "@/components/kiosk/shared/useItemModifiers";
import { toCartItem } from "@/components/kiosk/shared/useKioskCheckout";
import type { MenuItemType } from "@/lib/types";
import {
  kioskItemSourceFromKey,
  type KioskCartLine,
} from "@/stores/useKioskCartStore";

// Kiosk items must carry the menu category they were picked from: the server
// resolves an item's prep station from order_items.category_id, and KDS routes
// on that. Before this, every kiosk item was written "Uncategorized" with no
// category_id and skipped every prep-station display.

const mockGetCategoryById = jest.fn();
jest.mock("@/stores/useMenuStore", () => ({
  useMenuStore: Object.assign(jest.fn(), {
    getState: () => ({ getCategoryById: mockGetCategoryById }),
  }),
}));
jest.mock("@/stores/useOrderStore", () => ({ useOrderStore: { getState: jest.fn() } }));
jest.mock("@/stores/useStoreSettingsStore", () => ({ useStoreSettingsStore: { getState: jest.fn() } }));
jest.mock("@/stores/useKioskProfileStore", () => ({ useKioskProfileStore: { getState: jest.fn() } }));
jest.mock("@/hooks/useSupabaseClient", () => ({ useSupabaseClient: jest.fn() }));
jest.mock("@/services/paymentService", () => ({ payFullCard: jest.fn() }));
jest.mock("@/services/paymentJournal", () => ({ completePaymentJournal: jest.fn() }));
jest.mock("@/services/posAccessService", () => ({ refreshSelectedStationOperationalState: jest.fn() }));
jest.mock("@/services/messaging/sendReceiptService", () => ({ sendReceipt: jest.fn() }));
jest.mock("@/services/printing/PrinterService", () => ({ PrinterService: {} }));
jest.mock("@/services/printing/PrintRouter", () => ({ getReceiptPrinter: jest.fn() }));
jest.mock("@/services/terminals/chargeActiveTerminal", () => ({}));
jest.mock("@/services/terminals/cancelActiveTerminalCharge", () => ({ cancelActiveTerminalCharge: jest.fn() }));
jest.mock("@/lib/order-calculator", () => ({ calculateOrderTotals: jest.fn() }));
jest.mock("@/components/kiosk/shared/flagKioskAssistance", () => ({ flagKioskAssistance: jest.fn() }));

const item = {
  id: "item-1",
  name: "Test Item",
  price: 3,
  cashPrice: 2.9,
} as MenuItemType;

function asLine(line: Omit<KioskCartLine, "lineId">): KioskCartLine {
  return { ...line, lineId: "line-1" };
}

beforeEach(() => {
  mockGetCategoryById.mockReset();
});

describe("kioskItemSourceFromKey", () => {
  it("splits the shared menuId:categoryId key", () => {
    expect(kioskItemSourceFromKey("menu-1:cat-1")).toEqual({
      menuId: "menu-1",
      categoryId: "cat-1",
    });
  });

  it("returns undefined for a missing or malformed key", () => {
    expect(kioskItemSourceFromKey(null)).toBeUndefined();
    expect(kioskItemSourceFromKey(undefined)).toBeUndefined();
    expect(kioskItemSourceFromKey("no-separator")).toBeUndefined();
  });
});

describe("kiosk cart line → CartItem category", () => {
  it("stamps the picked-from category onto the order item", () => {
    mockGetCategoryById.mockReturnValue({ id: "cat-1", name: "Coffee Shop" });
    const line = buildKioskCartLine(item, [], 1, {
      menuId: "menu-1",
      categoryId: "cat-1",
    });

    const cartItem = toCartItem(asLine(line));

    expect(cartItem.addedFromCategoryId).toBe("cat-1");
    expect(cartItem.addedFromMenuId).toBe("menu-1");
    expect(cartItem.category_name).toBe("Coffee Shop");
    expect(mockGetCategoryById).toHaveBeenCalledWith("cat-1");
  });

  it("leaves category empty when the source is unknown", () => {
    const line = buildKioskCartLine(item, [], 1);

    const cartItem = toCartItem(asLine(line));

    expect(cartItem.addedFromCategoryId).toBeNull();
    expect(cartItem.addedFromMenuId).toBeNull();
    expect(cartItem.category_name).toBeUndefined();
    expect(mockGetCategoryById).not.toHaveBeenCalled();
  });
});
