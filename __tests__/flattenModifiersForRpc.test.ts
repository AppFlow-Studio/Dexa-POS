/**
 * The local-first add/edit payload for modifiers (Charcoal S1-0011).
 *
 * A custom modifier typed on the modifier screen carries sentinel ids that
 * are not uuids; sending them made add_order_item_v5 roll the whole item back.
 */
jest.mock("uuid", () => ({ v4: () => "00000000-0000-4000-8000-000000000000" }));

import { flattenModifiersForRpc } from "@/stores/useOrderStore";

const GROUP = "0b54d935-af6b-4760-a43a-553149761987";
const OPTION = "e0cc1862-d685-4999-9468-0addff0f599c";

describe("flattenModifiersForRpc", () => {
  it("nulls a custom modifier's sentinel ids and keeps its name/price", () => {
    const rows = flattenModifiersForRpc({
      customizations: {
        modifiers: [
          {
            categoryId: "custom-modifiers",
            categoryName: "Custom",
            options: [{ id: "custom_mod_1_abc", name: "Add espresso", price: 1.5 }],
          },
        ],
      },
    } as any);

    expect(rows).toEqual([
      expect.objectContaining({
        modifier_group_id: null,
        modifier_item_id: null,
        modifier_group_name: "Custom",
        modifier_name: "Add espresso",
        price_modifier: 1.5,
      }),
    ]);
  });

  it("keeps real menu modifier ids and prices a 'no' option at 0", () => {
    const rows = flattenModifiersForRpc({
      customizations: {
        modifiers: [
          {
            categoryId: GROUP,
            categoryName: "Toppings",
            options: [
              { id: OPTION, name: "Whipped cream", price: 1 },
              { id: OPTION, name: "Syrup", price: 0.5, isNo: true },
            ],
          },
        ],
        addOns: [{ id: "addon-local-1", name: "Extra cup", price: 2 }],
      },
    } as any);

    expect(rows).toEqual([
      expect.objectContaining({ modifier_group_id: GROUP, modifier_item_id: OPTION, price_modifier: 1 }),
      expect.objectContaining({ modifier_name: "Syrup", price_modifier: 0, is_no: true }),
      // A non-uuid add-on id would fail the same cast.
      expect.objectContaining({ modifier_item_id: null, modifier_name: "Extra cup", price_modifier: 2 }),
    ]);
  });

  it("returns null when there is nothing to send", () => {
    expect(flattenModifiersForRpc({ customizations: {} } as any)).toBeNull();
  });
});
