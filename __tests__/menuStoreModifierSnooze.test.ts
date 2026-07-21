import { useMenuStore } from "@/stores/useMenuStore";
import { ModifierCategory } from "@/lib/types";
import { SNOOZE_INFINITY } from "@/lib/snoozeDurations";

const makeGroup = (): ModifierCategory => ({
  id: "grp-1",
  name: "Size",
  type: "optional",
  selectionType: "single",
  options: [
    { id: "opt-a", name: "Small", price: 0, isAvailable: true },
    { id: "opt-b", name: "Large", price: 1, isAvailable: true },
  ],
});

const seed = () => {
  const group = makeGroup();
  useMenuStore.setState({
    modifierGroups: [group],
    modifierGroupsById: { [group.id]: group },
  });
};

const groupById = () => useMenuStore.getState().modifierGroupsById["grp-1"];
const optById = (id: string) =>
  useMenuStore.getState().modifierGroups[0].options.find((o) => o.id === id);

describe("useMenuStore modifier snooze", () => {
  beforeEach(seed);

  it("snoozeModifierOption marks a single option out of stock", () => {
    useMenuStore.getState().snoozeModifierOption("opt-a", SNOOZE_INFINITY, "out");

    const a = optById("opt-a");
    const b = optById("opt-b");
    expect(a?.isAvailable).toBe(false);
    expect(a?.snoozedUntil).toBe(SNOOZE_INFINITY);
    expect(a?.snoozeReason).toBe("out");
    // Other option untouched.
    expect(b?.isAvailable).toBe(true);
    expect(b?.snoozedUntil).toBeUndefined();
    // Map stays in sync with the array.
    expect(groupById().options.find((o) => o.id === "opt-a")?.isAvailable).toBe(
      false,
    );
  });

  it("unsnoozeModifierOption restores the option", () => {
    useMenuStore.getState().snoozeModifierOption("opt-a", SNOOZE_INFINITY);
    useMenuStore.getState().unsnoozeModifierOption("opt-a");

    const a = optById("opt-a");
    expect(a?.isAvailable).toBe(true);
    expect(a?.snoozedUntil).toBeNull();
    expect(a?.snoozeReason).toBeNull();
  });

  it("snoozeModifierGroup fans out to every option in the group", () => {
    useMenuStore.getState().snoozeModifierGroup("grp-1", SNOOZE_INFINITY);

    expect(optById("opt-a")?.isAvailable).toBe(false);
    expect(optById("opt-b")?.isAvailable).toBe(false);
    expect(optById("opt-a")?.snoozedUntil).toBe(SNOOZE_INFINITY);
    expect(optById("opt-b")?.snoozedUntil).toBe(SNOOZE_INFINITY);
  });

  it("unsnoozeModifierGroup restores every option in the group", () => {
    useMenuStore.getState().snoozeModifierGroup("grp-1", SNOOZE_INFINITY);
    useMenuStore.getState().unsnoozeModifierGroup("grp-1");

    expect(optById("opt-a")?.isAvailable).toBe(true);
    expect(optById("opt-b")?.isAvailable).toBe(true);
    expect(optById("opt-a")?.snoozedUntil).toBeNull();
    expect(optById("opt-b")?.snoozedUntil).toBeNull();
  });

  it("does not mutate other groups", () => {
    const other: ModifierCategory = {
      id: "grp-2",
      name: "Sauce",
      type: "optional",
      selectionType: "multiple",
      options: [{ id: "opt-c", name: "Ranch", price: 0, isAvailable: true }],
    };
    useMenuStore.setState((s) => ({
      modifierGroups: [...s.modifierGroups, other],
      modifierGroupsById: { ...s.modifierGroupsById, "grp-2": other },
    }));

    useMenuStore.getState().snoozeModifierGroup("grp-1", SNOOZE_INFINITY);

    const c = useMenuStore
      .getState()
      .modifierGroups.find((g) => g.id === "grp-2")
      ?.options[0];
    expect(c?.isAvailable).toBe(true);
    expect(c?.snoozedUntil).toBeUndefined();
  });
});

describe("useMenuStore reconcileSnoozes (website / other-station sync)", () => {
  beforeEach(seed);

  it("applies an active modifier snooze fetched from the server", () => {
    // Simulates a 86 made on the website: opt-a is in the active set.
    useMenuStore
      .getState()
      .reconcileSnoozes(
        [],
        [
          {
            modifier_group_item_id: "opt-a",
            modifier_group_id: "grp-1",
            snoozed_until: SNOOZE_INFINITY,
            snooze_reason: "ran out",
          },
        ],
        [],
        [],
      );

    expect(optById("opt-a")?.isAvailable).toBe(false);
    expect(optById("opt-a")?.snoozedUntil).toBe(SNOOZE_INFINITY);
    expect(optById("opt-b")?.isAvailable).toBe(true);
  });

  it("restores a modifier that dropped out of the active set (delta)", () => {
    // opt-a was snoozed; the website restored it, so it's now in restoredModifierIds.
    useMenuStore.getState().snoozeModifierOption("opt-a", SNOOZE_INFINITY);
    useMenuStore.getState().reconcileSnoozes([], [], [], ["opt-a"]);

    expect(optById("opt-a")?.isAvailable).toBe(true);
    expect(optById("opt-a")?.snoozedUntil).toBeNull();
  });

  it("never clobbers a local optimistic 86 absent from the server set", () => {
    // A just-applied local 86 (RPC still in flight) is NOT in the server's active
    // set yet, and NOT in restoredModifierIds — it must survive the reconcile.
    useMenuStore.getState().snoozeModifierOption("opt-a", SNOOZE_INFINITY, "local");
    useMenuStore.getState().reconcileSnoozes([], [], [], []);

    expect(optById("opt-a")?.isAvailable).toBe(false);
    expect(optById("opt-a")?.snoozedUntil).toBe(SNOOZE_INFINITY);
  });

  it("applies and restores item snoozes across collections", () => {
    const item: any = {
      id: "item-1",
      name: "Burger",
      price: 10,
      availability: true,
    };
    useMenuStore.setState({
      menuItems: [item],
      menuItemsById: { "item-1": item },
      menus: [],
    });

    useMenuStore
      .getState()
      .reconcileSnoozes(
        [
          {
            menu_item_id: "item-1",
            snoozed_until: SNOOZE_INFINITY,
            snooze_reason: null,
          },
        ],
        [],
        [],
        [],
      );
    expect(useMenuStore.getState().menuItemsById["item-1"].availability).toBe(
      false,
    );
    expect(useMenuStore.getState().menuItemsById["item-1"].snoozedUntil).toBe(
      SNOOZE_INFINITY,
    );

    // Now the server no longer lists it -> restore via delta.
    useMenuStore.getState().reconcileSnoozes([], [], ["item-1"], []);
    expect(useMenuStore.getState().menuItemsById["item-1"].availability).toBe(
      true,
    );
    expect(
      useMenuStore.getState().menuItemsById["item-1"].snoozedUntil,
    ).toBeNull();
  });
});
