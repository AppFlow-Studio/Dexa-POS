import { colors } from "@/lib/theme";
import { ArrowLeft, ArrowRight } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

interface EodWizardLayoutProps {
  title: string;
  subtitle: string;
  currentStep: number;
  totalSteps: number;
  canGoBack: boolean;
  canGoNext: boolean;
  isNextLoading?: boolean;
  nextLabel?: string;
  onBack: () => void;
  onNext: () => void;
}

export default function EodWizardLayout({
  title,
  subtitle,
  currentStep,
  totalSteps,
  canGoBack,
  canGoNext,
  isNextLoading = false,
  nextLabel = "Next",
  onBack,
  onNext,
  children,
}: React.PropsWithChildren<EodWizardLayoutProps>) {
  return (
    <View className="flex-1 rounded-2xl border border-gray-700 bg-card/30 p-4">
      <View className="mb-4 rounded-xl border border-gray-700 bg-card p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 gap-2 pr-3">
            <Text className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-300">
              Step {currentStep + 1} / {totalSteps}
            </Text>
            <Text className="text-lg font-bold text-white">{title}</Text>
            <Text className="text-sm text-zinc-300">{subtitle}</Text>
          </View>
          <View className="h-12 w-12 items-center justify-center rounded-full bg-slate-900 border border-gray-700">
            <Text className="text-xs font-semibold text-white">{currentStep + 1}</Text>
          </View>
        </View>
      </View>

      <View className="mb-4 flex-1">{children}</View>

      <View className="flex-row items-center gap-3 border-t border-gray-700 pt-3">
        <TouchableOpacity
          onPress={onBack}
          disabled={!canGoBack}
          className="flex-1 items-center justify-center rounded-xl border border-gray-700 bg-card py-3.5"
          style={{ opacity: canGoBack ? 1 : 0.4 }}
        >
          <View className="flex-row items-center gap-2">
            <ArrowLeft size={16} color={colors.heading} />
            <Text className="font-semibold text-sm text-white">Back</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onNext}
          disabled={!canGoNext || isNextLoading}
          className="flex-[2] items-center justify-center rounded-xl py-3.5"
          style={{
            backgroundColor: canGoNext ? colors.teal : `${colors.teal}80`,
            opacity: canGoNext ? 1 : 0.4,
          }}
        >
          {isNextLoading ? (
            <ActivityIndicator color={colors.screen} />
          ) : (
            <View className="flex-row items-center gap-2">
              <Text className="font-semibold text-sm text-black">{nextLabel}</Text>
              <ArrowRight size={16} color="#000000" />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

