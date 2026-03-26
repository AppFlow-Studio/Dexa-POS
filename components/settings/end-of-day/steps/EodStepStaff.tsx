import { colors } from "@/lib/theme";
import { ChecklistItem, ChecklistItemId } from "@/stores/useEndOfDayStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import EodChecklistRow from "../EodChecklistRow";

const resolveItem = (
  list: ChecklistItem[],
  id: ChecklistItemId
): ChecklistItem | undefined => list.find((i) => i.id === id);

interface EodStepStaffProps {
  checklist: ChecklistItem[];
  onOpenTimeclock: () => void;
  onOpenBulkClockOut: () => void;
  onRefresh: () => Promise<void> | void;
}

export default function EodStepStaff({
  checklist,
  onOpenTimeclock,
  onOpenBulkClockOut,
  onRefresh,
}: EodStepStaffProps) {
  const staffItem = resolveItem(checklist, "shifts_reviewed");
  const hasActiveSessions = useTimeclockStore(
    (s) => Object.keys(s.sessions).length > 0
  );

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
          Review all active shifts and confirm staff are clocked out. Open timeclock
          for final clock-out actions before close out.
        </Text>
        <View style={{ marginTop: 10, gap: 8 }}>
          <TouchableOpacity
            onPress={onOpenTimeclock}
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
              Open Timeclock
            </Text>
          </TouchableOpacity>
          {hasActiveSessions && (
            <TouchableOpacity
              onPress={onOpenBulkClockOut}
              style={{
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.danger + "50",
                backgroundColor: colors.danger + "15",
                paddingHorizontal: 10,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.danger }}>
                End All Shifts
              </Text>
            </TouchableOpacity>
          )}
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
        title="Staff clock-out"
        description={staffItem?.description}
        status={staffItem?.status || "pending"}
        detail={staffItem?.detail}
      />
    </View>
  );
}

