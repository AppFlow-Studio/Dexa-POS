import { colors } from "@/lib/theme";
import { useColorScheme } from "@/lib/useColorScheme";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { EmptyState } from "../components/EmptyState";
import { SearchField } from "../components/SearchField";
import { useFloors } from "../hooks/useFloors";
import { useMinuteTick } from "../hooks/useMinuteTick";
import { metrics } from "../lib/tokens";
import { PageHeader } from "../primitives";
import { PlanSheet } from "../screens/tables/PlanSheet";
import { TableRow } from "../screens/tables/TableRow";
import { useTableRows, type TableRowData } from "../screens/tables/useTableRows";

const keyExtractor = (row: TableRowData) => row.id;

/**
 * New order → Dine in: free tables only, with the same plan picker and
 * search as the Tables tab. Tapping one replaces this page with the seat
 * page, so Back from the seated table lands on the tabs. Route:
 * /handheld/tables/pick.
 */
export default function PickTablePage() {
  const router = useRouter();
  const { isDarkColorScheme: dark } = useColorScheme();
  const [query, setQuery] = useState("");
  const [pickingPlan, setPickingPlan] = useState(false);
  const now = useMinuteTick();
  const rows = useTableRows("free", now, query);
  const floors = useFloors();

  const seat = useCallback(
    (tableId: string) => router.replace({ pathname: "/handheld/seat/[tableId]", params: { tableId } }),
    [router],
  );
  const renderItem = useCallback<ListRenderItem<TableRowData>>(
    ({ item, index }) => <TableRow {...item} divider={index > 0} dark={dark} onPress={seat} onSeat={seat} />,
    [seat, dark],
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      <PageHeader
        title="Choose a table"
        subtitle={
          floors.chips.length ? `${rows.freeCount} free` : [rows.floorName, `${rows.freeCount} free`].filter(Boolean).join(" · ")
        }
        picker={
          floors.chips.length
            ? { label: rows.floorName || "All", onPress: () => setPickingPlan(true), accessibilityLabel: "Choose which tables to show" }
            : undefined
        }
        onBack={() => router.back()}
      />
      <SearchField value={query} onChange={setQuery} placeholder="Table number or name" />
      {rows.section.length === 0 ? (
        <EmptyState
          title={query.trim() ? "No table matches" : "No free tables"}
          hint={query.trim() ? "Try the number or the name." : "Every table here is in use."}
        />
      ) : (
        <FlashList
          data={rows.section}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          estimatedItemSize={metrics.row}
          extraData={dark}
          keyboardShouldPersistTaps="handled"
        />
      )}
      {pickingPlan ? (
        <PlanSheet plans={floors.chips} active={floors.floorId} onPick={floors.setFloorId} onClose={() => setPickingPlan(false)} />
      ) : null}
    </View>
  );
}
