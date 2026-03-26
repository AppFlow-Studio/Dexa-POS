import { colors } from "@/lib/theme";
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
    <View style={{ gap: 12 }}>
      <TouchableOpacity
        onPress={onRunSummary}
        style={{
          borderRadius: 8,
          backgroundColor: colors.teal + "20",
          borderWidth: 1,
          borderColor: colors.teal + "50",
          paddingHorizontal: 10,
          paddingVertical: 10,
        }}
        disabled={summaryLoading}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.teal }}>
          Run daily summary
        </Text>
      </TouchableOpacity>

      <EodChecklistRow
        title="Report generated"
        description={reportItem?.description}
        status={reportItem?.status || "pending"}
        detail={reportItem?.detail}
      />

      <View
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 12,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
          Sales summary
        </Text>
        {summaryLoading ? (
          <Text style={{ fontSize: 11, color: colors.label, marginTop: 4 }}>
            Loading…
          </Text>
        ) : !summary ? (
          <Text style={{ fontSize: 11, color: colors.label, marginTop: 4 }}>
            Run summary to see totals and close your day.
          </Text>
        ) : (
          <View style={{ marginTop: 8, gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, color: colors.label }}>Gross sales</Text>
              <Text style={{ fontSize: 12, color: colors.heading, fontWeight: "600" }}>
                ${summary.totalSales.toFixed(2)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, color: colors.label }}>Discounts</Text>
              <Text style={{ fontSize: 12, color: colors.heading, fontWeight: "600" }}>
                ${summary.totalDiscounts.toFixed(2)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, color: colors.label }}>Tips</Text>
              <Text style={{ fontSize: 12, color: colors.heading, fontWeight: "600" }}>
                ${summary.totalTips.toFixed(2)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, color: colors.label }}>Labor</Text>
              <Text style={{ fontSize: 12, color: colors.heading, fontWeight: "600" }}>
                ${summary.totalLaborCost.toFixed(2)}
              </Text>
            </View>
          </View>
        )}
      </View>
      {!canComplete ? (
        <TouchableOpacity
          onPress={onContinueWithIssues}
          style={{
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.warning + "50",
            backgroundColor: colors.warning + "15",
            paddingHorizontal: 10,
            paddingVertical: 10,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.warning }}>
            Continue with issues
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

