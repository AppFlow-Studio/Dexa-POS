import { colors } from "@/lib/theme";
import { DailySummary } from "@/stores/useEndOfDayStore";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface EodStepPaymentsPlaceholderProps {
  summary: DailySummary | null;
  summaryLoading: boolean;
  onGoToSettlement: () => void;
}

export default function EodStepPaymentsPlaceholder({
  summary,
  summaryLoading,
  onGoToSettlement,
}: EodStepPaymentsPlaceholderProps) {
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
          Payment settlement is ready for a dedicated flow. For v1, show your card
          and cash snapshot before moving to the close-out report.
        </Text>
      </View>

      <View
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: 10,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
          Today's cash/card split
        </Text>
        {summaryLoading ? (
          <Text style={{ fontSize: 11, color: colors.label, marginTop: 8 }}>
            Loading summary…
          </Text>
        ) : null}
        {!summary && !summaryLoading ? (
          <Text style={{ fontSize: 11, color: colors.label, marginTop: 8 }}>
            Run report on the final step to populate this snapshot.
          </Text>
        ) : null}
        {!!summary ? (
          <View style={{ marginTop: 8, gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, color: colors.label }}>Card payments</Text>
              <Text style={{ fontSize: 12, color: colors.heading, fontWeight: "600" }}>
                ${summary.cardTotal.toFixed(2)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, color: colors.label }}>Cash payments</Text>
              <Text style={{ fontSize: 12, color: colors.heading, fontWeight: "600" }}>
                ${summary.cashTotal.toFixed(2)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, color: colors.label }}>Other payments</Text>
              <Text style={{ fontSize: 12, color: colors.heading, fontWeight: "600" }}>
                ${summary.otherTotal.toFixed(2)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      <View
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.teal + "50",
          backgroundColor: colors.teal + "12",
          padding: 12,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.teal }}>
          Terminal Settlement
        </Text>
        <Text style={{ fontSize: 11, color: colors.label, marginTop: 6 }}>
          Close the terminal batch and settle all captured payments with the acquiring
          banks. Tips cannot be adjusted after settlement.
        </Text>
        <TouchableOpacity
          onPress={onGoToSettlement}
          style={{
            marginTop: 10,
            borderRadius: 8,
            backgroundColor: colors.teal,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.onSolid }}>
            Open Settlement
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

