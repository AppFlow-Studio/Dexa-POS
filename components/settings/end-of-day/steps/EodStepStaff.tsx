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
  const hasOtherActiveSessions = useTimeclockStore(
    (s) => Object.keys(s.sessions).some((id) => id !== s.activeEmployeeId)
  );

  return (
    <View className="gap-4">
      <View className="rounded-xl border border-gray-700 bg-panel p-4">
        <Text className="text-sm text-zinc-200">
          Review all active shifts and confirm staff are clocked out. Open timeclock
          for final clock-out actions before close out.
        </Text>
        <View className="mt-3 gap-2">
          <TouchableOpacity
            onPress={onOpenTimeclock}
            className="rounded-lg bg-cyan-500/20 px-3 py-3"
          >
            <Text className="text-sm font-semibold text-cyan-100">
              Open Timeclock
            </Text>
          </TouchableOpacity>
          {hasOtherActiveSessions && (
            <TouchableOpacity
              onPress={onOpenBulkClockOut}
              className="rounded-lg border border-red-700/40 bg-red-500/15 px-3 py-3"
            >
              <Text className="text-sm font-semibold text-red-300">
                End All Shifts
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => void onRefresh()}
            className="rounded-lg border border-gray-700 bg-panel px-3 py-3"
          >
            <Text className="text-sm text-zinc-100">Refresh status</Text>
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

