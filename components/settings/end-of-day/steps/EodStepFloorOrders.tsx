import { ChecklistItem, ChecklistItemId } from "@/stores/useEndOfDayStore";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import EodChecklistRow from "../EodChecklistRow";

const resolveItem = (
  list: ChecklistItem[],
  id: ChecklistItemId
): ChecklistItem | undefined => list.find((i) => i.id === id);

interface EodStepFloorOrdersProps {
  checklist: ChecklistItem[];
  isRunning: boolean;
  onRefresh: () => Promise<void> | void;
  onOpenTables: () => void;
  onOpenOrders: () => void;
}

export default function EodStepFloorOrders({
  checklist,
  isRunning,
  onRefresh,
  onOpenTables,
  onOpenOrders,
}: EodStepFloorOrdersProps) {
  const tablesItem = resolveItem(checklist, "tables_clear");
  const ordersItem = resolveItem(checklist, "orders_closed");

  const isPassed =
    tablesItem?.status === "passed" && ordersItem?.status === "passed";

  return (
    <View className="gap-4">
      <View className="rounded-xl border border-gray-700 bg-panel p-4">
        <Text className="text-sm text-zinc-200">
          Confirm every occupied table is clear and every unpaid order has either
          been paid, voided, or closed in previous orders.
        </Text>
        <TouchableOpacity
          onPress={() => void onRefresh()}
          className="mt-3 self-start rounded-lg bg-cyan-500/20 px-3 py-2"
          disabled={isRunning}
        >
          <Text className="text-xs font-semibold text-cyan-200">
            Refresh status
          </Text>
        </TouchableOpacity>
      </View>

      <EodChecklistRow
        title="Floor status"
        description={tablesItem?.description}
        status={tablesItem?.status || "pending"}
        detail={tablesItem?.detail}
        actionLabel="Go to tables"
        onPress={onOpenTables}
      />
      <EodChecklistRow
        title="Order closure"
        description={ordersItem?.description}
        status={ordersItem?.status || "pending"}
        detail={ordersItem?.detail}
        actionLabel="Go to orders"
        onPress={onOpenOrders}
      />

      <View
        className="rounded-xl border border-gray-700 bg-emerald-900/20 p-3"
      >
        <Text className="text-sm font-semibold text-emerald-200">
          {isPassed
            ? "Floor and orders checks are complete."
            : "This step resolves when both checks are passing."}
        </Text>
      </View>
    </View>
  );
}

