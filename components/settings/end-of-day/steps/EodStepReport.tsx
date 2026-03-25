import { ChecklistItem, ChecklistItemId, DailySummary } from "@/stores/useEndOfDayStore";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import EodChecklistRow from "../EodChecklistRow";

const resolveItem = (
  list: ChecklistItem[],
  id: ChecklistItemId
): ChecklistItem | undefined => list.find((i) => i.id === id);

interface EodStepReportProps {
  checklist: ChecklistItem[];
  summary: DailySummary | null;
  summaryLoading: boolean;
  onRunSummary: () => void;
  canComplete: boolean;
  onContinueWithIssues: () => void;
}

export default function EodStepReport({
  checklist,
  summary,
  summaryLoading,
  onRunSummary,
  canComplete,
  onContinueWithIssues,
}: EodStepReportProps) {
  const reportItem = resolveItem(checklist, "report_generated");

  return (
    <View className="gap-4">
      <TouchableOpacity
        onPress={onRunSummary}
        className="rounded-lg bg-cyan-500/20 px-3 py-3"
        disabled={summaryLoading}
      >
        <Text className="text-sm font-semibold text-cyan-100">Run daily summary</Text>
      </TouchableOpacity>

      <EodChecklistRow
        title="Report generated"
        description={reportItem?.description}
        status={reportItem?.status || "pending"}
        detail={reportItem?.detail}
      />

      <View className="rounded-xl border border-gray-700 bg-panel p-4">
        <Text className="text-sm font-semibold text-white">Sales summary</Text>
        {summaryLoading ? (
          <Text className="mt-1 text-xs text-zinc-300">Loading…</Text>
        ) : !summary ? (
          <Text className="mt-1 text-xs text-zinc-400">
            Run summary to see totals and close your day.
          </Text>
        ) : (
          <View className="mt-2 gap-2">
            <View className="flex-row justify-between">
              <Text className="text-zinc-300">Gross sales</Text>
              <Text className="text-white">${summary.totalSales.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-zinc-300">Discounts</Text>
              <Text className="text-white">${summary.totalDiscounts.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-zinc-300">Tips</Text>
              <Text className="text-white">${summary.totalTips.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-zinc-300">Labor</Text>
              <Text className="text-white">${summary.totalLaborCost.toFixed(2)}</Text>
            </View>
          </View>
        )}
      </View>
      {!canComplete ? (
        <TouchableOpacity
          onPress={onContinueWithIssues}
          className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-3"
        >
          <Text className="text-sm font-semibold text-amber-100">
            Continue with issues
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

