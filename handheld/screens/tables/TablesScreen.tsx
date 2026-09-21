import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import React, { useCallback, useMemo, useState } from "react";
import { Avatar } from "../../components/Avatar";
import { EmptyState } from "../../components/EmptyState";
import { SectionLabel } from "../../components/SectionLabel";
import { useMinuteTick } from "../../hooks/useMinuteTick";
import { metrics } from "../../lib/tokens";
import { Screen, SegmentedTabs, type SegmentedOption } from "../../primitives";
import { TableRow } from "./TableRow";
import { TableSheet } from "./TableSheet";
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

/** Artifact screen 1 — Tables. Read-only in this wave. */
export function TablesScreen() {
  const [scope, setScope] = useState<TablesScope>("mine");
  const now = useMinuteTick();
  const rows = useTableRows(scope, now);
  const myName = useEmployeeStore((s) => s.loggedInEmployee?.displayName ?? "");
  const [selected, setSelected] = useState<TableRowData | null>(null);
  const closeSheet = useCallback(() => setSelected(null), []);

  const items = useMemo(
    () => [
      ...toItems("Needs you", rows.needsYou),
      ...toItems(scope === "mine" ? "Your section" : "All tables", rows.section),
    ],
    [rows.needsYou, rows.section, scope],
  );

  const byId = useMemo(
    () => new Map([...rows.needsYou, ...rows.section].map((r) => [r.id, r] as const)),
    [rows.needsYou, rows.section],
  );
  const openTable = useCallback((id: string) => setSelected(byId.get(id) ?? null), [byId]);

  const renderItem = useCallback<ListRenderItem<Item>>(
    ({ item }) =>
      item.kind === "label" ? (
        <SectionLabel text={item.text} />
      ) : (
        <TableRow {...item.row} divider={item.divider} onPress={openTable} />
      ),
    [openTable],
  );

  const options: readonly SegmentedOption<TablesScope>[] = [
    { value: "mine", label: "Mine", count: rows.mineCount },
    { value: "all", label: "All", count: rows.allCount },
  ];

  return (
    <Screen
      title="Tables"
      subtitle={`${rows.floorName} · ${rows.occupied} of ${rows.allCount} seated`}
      right={myName ? <Avatar name={myName} /> : undefined}
    >
      <SegmentedTabs value={scope} options={options} onChange={setScope} />
      {items.length === 0 ? (
        <EmptyState
          title={scope === "mine" ? "No tables in your section" : "No tables yet"}
          hint={
            scope === "mine"
              ? "Seat a table to make it yours, or switch to All."
              : "Tables appear once the floor plan has loaded."
          }
        />
      ) : (
        <FlashList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          estimatedItemSize={metrics.row}
        />
      )}
      <TableSheet row={selected} onClose={closeSheet} />
    </Screen>
  );
}
