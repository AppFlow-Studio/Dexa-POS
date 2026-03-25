import { CheckCircle2 } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface EodIntroScreenProps {
  locationName: string | null;
  dateLabel: string;
  isStartEnabled: boolean;
  onStart: () => void;
  onViewChecklist: () => void;
}

export default function EodIntroScreen({
  locationName,
  dateLabel,
  isStartEnabled,
  onStart,
  onViewChecklist,
}: EodIntroScreenProps) {
  return (
    <View className="gap-6">
      <View className="rounded-2xl border border-gray-700 bg-gradient-to-br from-teal-500/20 to-cyan-900/25 p-5">
        <Text className="text-sm uppercase tracking-[0.12em] text-cyan-200">
          End of Day
        </Text>
        <Text className="mt-2 text-3xl font-bold text-white">
          {dateLabel}
        </Text>
        <Text className="mt-1 text-sm text-zinc-200">
          {locationName || "Active location"}
        </Text>
        <View className="mt-4 gap-2">
          <View className="flex-row items-center gap-2">
            <CheckCircle2 size={16} color="#4ade80" />
            <Text className="text-sm text-zinc-100">
              Reconcile tables, close active drawers, and review staff clocks
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <CheckCircle2 size={16} color="#4ade80" />
            <Text className="text-sm text-zinc-100">Finalize tips and payments</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <CheckCircle2 size={16} color="#4ade80" />
            <Text className="text-sm text-zinc-100">Generate end-of-day report and close</Text>
          </View>
        </View>
      </View>

      <View className="gap-3">
        <TouchableOpacity
          onPress={onStart}
          disabled={!isStartEnabled}
          className="items-center rounded-xl py-3.5"
          style={{
            backgroundColor: isStartEnabled ? "#06b6d4" : "rgba(8,145,178,0.5)",
            opacity: isStartEnabled ? 1 : 0.6,
          }}
        >
          <Text className="text-sm font-semibold text-black">Start Close Out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onViewChecklist}
          className="items-center rounded-xl border border-gray-600 bg-transparent py-3.5"
        >
          <Text className="text-sm font-semibold text-zinc-200">
            View checklist only
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

