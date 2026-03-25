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
    <View className="gap-4">
      <View className="rounded-xl border border-gray-700 bg-panel p-4">
        <Text className="text-sm text-zinc-100">
          Payment settlement is ready for a dedicated flow. For v1, show your card
          and cash snapshot before moving to the close-out report.
        </Text>
      </View>

      <View className="rounded-xl border border-gray-700 bg-zinc-900/40 p-3">
        <Text className="text-sm font-semibold text-white">Today's cash/card split</Text>
        {summaryLoading ? (
          <Text className="mt-2 text-xs text-zinc-300">Loading summary…</Text>
        ) : null}
        {!summary && !summaryLoading ? (
          <Text className="mt-2 text-xs text-zinc-400">
            Run report on the final step to populate this snapshot.
          </Text>
        ) : null}
        {!!summary ? (
          <View className="mt-2 gap-2">
            <View className="flex-row justify-between">
              <Text className="text-zinc-300">Card payments</Text>
              <Text className="text-white">${summary.cardTotal.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-zinc-300">Cash payments</Text>
              <Text className="text-white">${summary.cashTotal.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-zinc-300">Other payments</Text>
              <Text className="text-white">${summary.otherTotal.toFixed(2)}</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View className="rounded-xl border border-purple-700 bg-purple-900/20 p-3">
        <Text className="text-sm font-semibold text-purple-200">
          Terminal Settlement
        </Text>
        <Text className="mt-1 text-xs text-zinc-200">
          Close the terminal batch and settle all captured payments with the acquiring
          banks. Tips cannot be adjusted after settlement.
        </Text>
        <TouchableOpacity
          onPress={onGoToSettlement}
          className="mt-3 self-start rounded-lg bg-purple-600 px-4 py-2"
        >
          <Text className="text-xs font-semibold text-white">
            Open Settlement
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

