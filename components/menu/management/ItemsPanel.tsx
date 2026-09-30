/**
 * Items tab: the whole item library as a responsive card grid, searchable in
 * place and filterable by status.
 *
 * Typing must stay cheap: the input is bound to the raw text, and everything
 * the grid receives (items, letter grouping, empty state) derives from the
 * DEFERRED text, so a keystroke re-renders this toolbar and nothing below it.
 * The filtering pass runs later, in an interruptible render (see lessons.md,
 * "Fast-typing duplicates/merges chars").
 */
import { router } from "expo-router";
import React, { useCallback, useDeferredValue, useMemo, useState } from "react";
import { View } from "react-native";

import { useSortedItems } from "@/hooks/menu/useMenuManagementData";
import { Package, Plus, SearchX } from "@/lib/icons";
import { isActivelySnoozed } from "@/lib/snoozeDurations";
import type { MenuItemType } from "@/lib/types";
import {
  useMenuManagementUiStore,
  type ItemStatusFilter,
} from "@/stores/useMenuManagementUiStore";

import { useMenuManagement } from "./context";
import { ItemGrid } from "./ItemGrid";
import { Button, EmptyState, FilterChips, SearchField, useS } from "./ui";

/**
 * Where the grid was scrolled to. Module state rather than the UI store: it is
 * written on every scroll event and read once on mount, so it must not notify
 * store subscribers ~10 times a second.
 */
let rememberedScrollOffset = 0;
const rememberScroll = (offset: number) => {
  rememberedScrollOffset = offset;
};

const matchesStatus = (
  item: MenuItemType,
  filter: ItemStatusFilter,
  is86: boolean,
) => {
  switch (filter) {
    case "available":
      return item.availability !== false && !is86;
    case "hidden":
      return item.availability === false;
    case "86":
      return is86;
    default:
      return true;
  }
};

function ItemsPanel() {
  const s = useS();
  const { canWrite } = useMenuManagement();
  const sortedItems = useSortedItems();
  const search = useMenuManagementUiStore((st) => st.itemSearch);
  const setSearch = useMenuManagementUiStore((st) => st.setItemSearch);
  const statusFilter = useMenuManagementUiStore((st) => st.itemStatusFilter);
  const setStatusFilter = useMenuManagementUiStore((st) => st.setItemStatusFilter);
  const deferredSearch = useDeferredValue(search);
  const deferredFilter = useDeferredValue(statusFilter);
  const [initialScrollOffset] = useState(() => rememberedScrollOffset);

  // One pass: the 86 check parses timestamps for timed snoozes, so it is done
  // once per item here and reused by the counts and the filter.
  const snoozedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of sortedItems) {
      if (isActivelySnoozed(item.snoozedUntil)) ids.add(item.id);
    }
    return ids;
  }, [sortedItems]);

  const filterOptions = useMemo(() => {
    let available = 0;
    let hidden = 0;
    for (const item of sortedItems) {
      if (item.availability === false) hidden += 1;
      else if (!snoozedIds.has(item.id)) available += 1;
    }
    return [
      { value: "all", label: "All", count: sortedItems.length },
      { value: "available", label: "Available", count: available },
      { value: "hidden", label: "Hidden", count: hidden },
      { value: "86", label: "86'd", count: snoozedIds.size },
    ] as const;
  }, [sortedItems, snoozedIds]);

  // Lower-cased once per library change, not per item per keystroke.
  const searchText = useMemo(
    () =>
      sortedItems.map(
        (item) => `${item.name}\n${item.description ?? ""}`.toLowerCase(),
      ),
    [sortedItems],
  );

  const query = deferredSearch.trim().toLowerCase();
  const isFiltered = query.length > 0 || deferredFilter !== "all";

  const visibleItems = useMemo(() => {
    if (!query && deferredFilter === "all") return sortedItems;
    return sortedItems.filter(
      (item, i) =>
        matchesStatus(item, deferredFilter, snoozedIds.has(item.id)) &&
        (!query || searchText[i].includes(query)),
    );
  }, [sortedItems, searchText, query, deferredFilter, snoozedIds]);

  const addItem = useCallback(() => router.push("/menu/add-item"), []);
  const clearFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
  }, [setSearch, setStatusFilter]);

  const empty = useMemo(
    () =>
      isFiltered ? (
        <EmptyState
          icon={SearchX}
          title="No items match"
          description="Try a different search or status filter."
          action={<Button label="Clear filters" onPress={clearFilters} />}
        />
      ) : (
        <EmptyState
          icon={Package}
          title="No items yet"
          description="Items you add here appear in your menus once they're placed in a category."
          action={
            <Button
              label="Add item"
              icon={Plus}
              variant="primary"
              onPress={addItem}
              disabled={!canWrite}
            />
          }
        />
      ),
    [isFiltered, clearFilters, addItem, canWrite],
  );

  return (
    <View style={{ flex: 1, gap: s(12) }}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: s(10),
        }}
      >
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search items"
          style={{ flexGrow: 1, flexBasis: s(240), maxWidth: s(420) }}
        />
        <FilterChips
          options={filterOptions}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <View style={{ flexGrow: 1, alignItems: "flex-end" }}>
          <Button
            label="Add item"
            icon={Plus}
            variant="primary"
            onPress={addItem}
            disabled={!canWrite}
          />
        </View>
      </View>

      <ItemGrid
        items={visibleItems}
        // A–Z groups under every filter and search, so switching pills keeps
        // the same alphabetical layout.
        groupByLetter
        empty={empty}
        initialScrollOffset={initialScrollOffset}
        onScrollOffsetChange={rememberScroll}
      />
    </View>
  );
}

export default React.memo(ItemsPanel);
