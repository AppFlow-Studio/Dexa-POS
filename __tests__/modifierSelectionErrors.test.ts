import { ModifierCategory } from "@/lib/types";
import { useModifierSelectionStore } from "@/stores/useModifierSelectionStore";

const singleRequired: ModifierCategory = {
  id: "size",
  name: "Size",
  type: "required",
  selectionType: "single",
  options: [
    { id: "sm", name: "Small", price: 0 },
    { id: "lg", name: "Large", price: 1 },
  ] as ModifierCategory["options"],
};

const multiRequired: ModifierCategory = {
  id: "sauce",
  name: "Sauce",
  type: "required",
  selectionType: "multiple",
  options: [
    { id: "bbq", name: "BBQ", price: 0 },
    { id: "hot", name: "Hot", price: 0 },
  ] as ModifierCategory["options"],
};

describe("useModifierSelectionStore — required-group error flags", () => {
  beforeEach(() => {
    useModifierSelectionStore.getState().init({});
  });

  it("flags the groups passed to setErrorCategories", () => {
    useModifierSelectionStore
      .getState()
      .setErrorCategories(["size", "sauce"]);
    expect(useModifierSelectionStore.getState().errorCategoryIds).toEqual({
      size: true,
      sauce: true,
    });
  });

  it("clears a group's error the instant a valid selection is made", () => {
    useModifierSelectionStore.getState().setErrorCategories(["size", "sauce"]);
    useModifierSelectionStore.getState().toggle("size", "lg", singleRequired);

    const { errorCategoryIds } = useModifierSelectionStore.getState();
    expect(errorCategoryIds.size).toBeUndefined();
    // Untouched groups stay flagged.
    expect(errorCategoryIds.sauce).toBe(true);
  });

  it("treats a long-press NO selection as satisfying the group", () => {
    useModifierSelectionStore.getState().setErrorCategories(["sauce"]);
    useModifierSelectionStore.getState().toggleNo("sauce", "bbq", multiRequired);
    expect(
      useModifierSelectionStore.getState().errorCategoryIds.sauce,
    ).toBeUndefined();
  });

  it("keeps the flag when a tap leaves the group with no selection", () => {
    // Select then deselect in a single-select group: count returns to 0, so
    // the group is still unsatisfied and must stay red.
    useModifierSelectionStore.getState().toggle("size", "lg", singleRequired);
    useModifierSelectionStore.getState().setErrorCategories(["size"]);
    useModifierSelectionStore.getState().toggle("size", "lg", singleRequired);

    expect(useModifierSelectionStore.getState().selectionCounts.size).toBe(0);
    expect(useModifierSelectionStore.getState().errorCategoryIds.size).toBe(
      true,
    );
  });

  it("wipes errors on init so reopening an item shows no stale red", () => {
    useModifierSelectionStore.getState().setErrorCategories(["size"]);
    useModifierSelectionStore.getState().init({});
    expect(useModifierSelectionStore.getState().errorCategoryIds).toEqual({});
  });

  it("clearErrorCategories drops every flag", () => {
    useModifierSelectionStore.getState().setErrorCategories(["size", "sauce"]);
    useModifierSelectionStore.getState().clearErrorCategories();
    expect(useModifierSelectionStore.getState().errorCategoryIds).toEqual({});
  });
});
