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
