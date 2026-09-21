import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import React, { useCallback, useMemo, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { useMinuteTick } from "../../hooks/useMinuteTick";
import { Screen } from "../../primitives";
import { TableDetailSheet } from "./TableDetailSheet";
import { TableRow } from "./TableRow";
import { useTableRows, type TableRowData } from "./useTableRows";

/** Collapsed row height hint for FlashList's first layout pass (dp). */
const ESTIMATED_ROW_HEIGHT = 64;

const keyExtractor = (row: TableRowData) => row.id;

/** Artifact screen 1 — the Tables list. Read-only in this wave. */
export function TablesScreen() {
  const { rows, occupied } = useTableRows();
  const now = useMinuteTick();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedName = useMemo(
    () => rows.find((r) => r.id === selectedId)?.name ?? "",
    [rows, selectedId],
  );
  const closeSheet = useCallback(() => setSelectedId(null), []);

  const renderItem = useCallback<ListRenderItem<TableRowData>>(
    ({ item }) => (
      <TableRow id={item.id} name={item.name} now={now} onPress={setSelectedId} />
    ),
    [now],
  );

  return (
    <Screen title="Tables" subtitle={`${occupied} of ${rows.length} occupied`}>
      {rows.length === 0 ? (
        <EmptyState
          title="No tables yet"
          hint="Tables appear once the floor plan has loaded."
        />
      ) : (
        <FlashList
          data={rows}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          estimatedItemSize={ESTIMATED_ROW_HEIGHT}
          extraData={now}
        />
      )}
      <TableDetailSheet
        tableId={selectedId}
        name={selectedName}
        onClose={closeSheet}
      />
    </Screen>
  );
}
