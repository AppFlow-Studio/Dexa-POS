import { ChecklistItem, ChecklistItemId } from "@/stores/useEndOfDayStore";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import EodChecklistRow from "../EodChecklistRow";

interface EodStepCashProps {
  checklist: ChecklistItem[];
  onOpenCashDrawer: () => void;
  onRefresh: () => Promise<void> | void;
}

const resolveItem = (
  list: ChecklistItem[],
  id: ChecklistItemId
): ChecklistItem | undefined => list.find((i) => i.id === id);

export default function EodStepCash({
  checklist,
  onOpenCashDrawer,
  onRefresh,
}: EodStepCashProps) {
  const drawerItem = resolveItem(checklist, "cash_drawer_closed");

  return (
    <View className="gap-4">
      <View className="rounded-xl border border-gray-700 bg-panel p-4">
        <Text className="text-sm text-zinc-200">
          Re-open drawers should be reconciled and closed before locking in your day.
          Use the drawer workflow to confirm end-of-day cash reconciliation.
        </Text>
        <View className="mt-3 gap-2">
          <TouchableOpacity
            onPress={onOpenCashDrawer}
            className="rounded-lg bg-cyan-500/20 px-3 py-3"
          >
            <Text className="text-sm font-semibold text-cyan-100">
              Open Cash Drawer Sheet
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void onRefresh()}
            className="rounded-lg border border-gray-700 bg-panel px-3 py-3"
          >
            <Text className="text-sm text-zinc-100">Refresh status</Text>
          </TouchableOpacity>
        </View>
      </View>

      <EodChecklistRow
        title="Cash drawer close"
        description={drawerItem?.description}
        status={drawerItem?.status || "pending"}
        detail={drawerItem?.detail}
      />
    </View>
  );
}

