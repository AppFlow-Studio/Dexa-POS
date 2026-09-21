import { colors } from "@/lib/theme";
import { useColorScheme } from "@/lib/useColorScheme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Search, X } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { Avatar } from "../../components/Avatar";
import { EmptyState } from "../../components/EmptyState";
import { SearchField } from "../../components/SearchField";
import { SectionLabel } from "../../components/SectionLabel";
import { useFloors } from "../../hooks/useFloors";
import { useMinuteTick } from "../../hooks/useMinuteTick";
import { metrics } from "../../lib/tokens";
import { IconButton, Screen, SegmentedTabs, type SegmentedOption } from "../../primitives";
import { PlanSheet } from "./PlanSheet";
import { TableRow } from "./TableRow";
import { useTableRows, type TableRowData, type TablesScope } from "./useTableRows";

type Item =
  | { kind: "label"; key: string; text: string }
  | { kind: "row"; key: string; row: TableRowData; divider: boolean };

function toItems(label: string, rows: TableRowData[]): Item[] {
  if (rows.length === 0) return [];
  return [
    { kind: "label", key: `label:${label}`, text: label },
    ...rows.map<Item>((row, i) => ({ kind: "row", key: row.id, row, divider: i > 0 })),
  ];
}

const keyExtractor = (item: Item) => item.key;
const getItemType = (item: Item) => item.kind;

const SECTION_LABEL: Record<TablesScope, string> = { mine: "Your section", all: "All tables", free: "Free tables" };
const EMPTY: Record<TablesScope, { title: string; hint: string }> = {
  mine: { title: "No tables in your section", hint: "Seat a table to make it yours, or switch to All." },
  all: { title: "No tables yet", hint: "Tables appear once the plan has loaded." },
  free: { title: "No free tables", hint: "Every table here is in use." },
};

/**
 * Artifact screen 1 — Tables. Mine / All / Free segments; with more than
 * one plan the subtitle is the plan picker (a sheet, so the list starts
 * 50dp higher than a chip row would allow); the header's search button (the
 * artifact's `.ib`) opens a name filter. Tapping a row pushes its page; a
 * free row opens the seat page.
 */
export function TablesScreen() {
  const router = useRouter();
  const { isDarkColorScheme: dark } = useColorScheme();
  const [scope, setScope] = useState<TablesScope>("mine");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [pickingPlan, setPickingPlan] = useState(false);
  const now = useMinuteTick();
  const rows = useTableRows(scope, now, searching ? query : "");
  const floors = useFloors();
  const myName = useEmployeeStore((s) => s.loggedInEmployee?.displayName ?? "");

  const items = useMemo(
    () => [...toItems("Needs you", rows.needsYou), ...toItems(SECTION_LABEL[scope], rows.section)],
    [rows.needsYou, rows.section, scope],
  );

  const openTable = useCallback(
    (id: string) => router.push({ pathname: "/handheld/table/[id]", params: { id } }),
    [router],
  );
  const seatTable = useCallback(
    (tableId: string) => router.push({ pathname: "/handheld/seat/[tableId]", params: { tableId } }),
    [router],
  );
  const toggleSearch = useCallback(() => {
    setSearching((on) => !on);
    setQuery("");
  }, []);

  const renderItem = useCallback<ListRenderItem<Item>>(
    ({ item }) =>
      item.kind === "label" ? (
        <SectionLabel text={item.text} />
      ) : (
        <TableRow {...item.row} divider={item.divider} dark={dark} onPress={openTable} onSeat={seatTable} />
      ),
    [openTable, seatTable, dark],
  );

  const options: readonly SegmentedOption<TablesScope>[] = [
    { value: "mine", label: "Mine", count: rows.mineCount },
    { value: "all", label: "All", count: rows.allCount },
    { value: "free", label: "Free", count: rows.freeCount },
  ];
  const empty = query.trim() ? { title: "No table matches", hint: "Try the number or the name." } : EMPTY[scope];

  return (
    <Screen
      title="Tables"
      subtitle={
        floors.chips.length
          ? `${rows.occupied} of ${rows.allCount} seated`
          : [rows.floorName, `${rows.occupied} of ${rows.allCount} seated`].filter(Boolean).join(" · ")
      }
      picker={
        floors.chips.length
          ? { label: rows.floorName || "All", onPress: () => setPickingPlan(true), accessibilityLabel: "Choose which tables to show" }
          : undefined
      }
      right={
        <>
          <IconButton label={searching ? "Close search" : "Search tables"} onPress={toggleSearch}>
            {searching ? <X size={24} color={colors.heading} /> : <Search size={24} color={colors.heading} />}
          </IconButton>
          {myName ? <Avatar name={myName} /> : null}
        </>
      }
    >
      {searching ? <SearchField value={query} onChange={setQuery} placeholder="Table number or name" autoFocus /> : null}
      <SegmentedTabs value={scope} options={options} onChange={setScope} />
      {items.length === 0 ? (
        <EmptyState title={empty.title} hint={empty.hint} />
      ) : (
        <FlashList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          estimatedItemSize={metrics.row}
          extraData={dark}
          keyboardShouldPersistTaps="handled"
        />
      )}
      {pickingPlan ? (
        <PlanSheet plans={floors.chips} active={floors.floorId} onPick={floors.setFloorId} onClose={() => setPickingPlan(false)} />
      ) : null}
    </Screen>
  );
}
