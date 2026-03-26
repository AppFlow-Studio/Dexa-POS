import { colors } from "@/lib/theme";
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
    <View style={{ gap: 12 }}>
      <View
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 12,
        }}
      >
        <Text style={{ fontSize: 13, color: colors.label }}>
          Re-open drawers should be reconciled and closed before locking in your day.
          Use the drawer workflow to confirm end-of-day cash reconciliation.
        </Text>
        <View style={{ marginTop: 10, gap: 8 }}>
          <TouchableOpacity
            onPress={onOpenCashDrawer}
            style={{
              borderRadius: 8,
              backgroundColor: colors.teal + "20",
              borderWidth: 1,
              borderColor: colors.teal + "50",
              paddingHorizontal: 10,
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.teal }}>
              Open Cash Drawer Sheet
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void onRefresh()}
            style={{
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingHorizontal: 10,
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontSize: 13, color: colors.label }}>Refresh status</Text>
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

