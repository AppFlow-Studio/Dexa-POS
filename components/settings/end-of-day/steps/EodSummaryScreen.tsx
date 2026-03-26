import { colors } from "@/lib/theme";
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
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.heading }}>
          EOD Summary
        </Text>
        <Text style={{ fontSize: 12, color: colors.label, marginTop: 4 }}>
          {checklist.length} checks · {passed} passed · {failed} blocking
        </Text>
        <Text style={{ fontSize: 11, color: colors.label, marginTop: 8 }}>
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

