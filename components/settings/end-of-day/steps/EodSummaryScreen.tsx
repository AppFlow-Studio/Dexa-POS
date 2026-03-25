import React from "react";
import { Text, View } from "react-native";
import EodChecklistRow from "../EodChecklistRow";
import { ChecklistItem } from "@/stores/useEndOfDayStore";

interface EodSummaryScreenProps {
  checklist: ChecklistItem[];
  blockingItems: ChecklistItem[];
  canComplete: boolean;
}

export default function EodSummaryScreen({
  checklist,
  blockingItems,
  canComplete,
}: EodSummaryScreenProps) {
  const passed = checklist.filter((item) => item.status === "passed").length;
  const failed = blockingItems.filter((item) => item.status === "failed").length;

  return (
    <View className="gap-4">
      <View className="rounded-xl border border-gray-700 bg-panel p-4">
        <Text className="text-lg font-semibold text-white">EOD Summary</Text>
        <Text className="mt-1 text-sm text-zinc-300">
          {checklist.length} checks · {passed} passed · {failed} blocking
        </Text>
        <Text className="mt-2 text-xs text-zinc-300">
          {canComplete
            ? "All required items are complete or intentionally overridden."
            : "Resolve blockers or confirm override to complete close out."}
        </Text>
      </View>
      {checklist.map((item) => (
        <EodChecklistRow
          key={item.id}
          title={item.label}
          description={item.description}
          status={item.status}
          detail={item.detail}
        />
      ))}
    </View>
  );
}

