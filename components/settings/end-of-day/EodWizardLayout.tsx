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
  hasBlockingItems?: boolean;
  onBack: () => void;
  onNext: () => void;
  onContinueWithIssues?: () => void;
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
  hasBlockingItems = false,
  onBack,
  onNext,
  onContinueWithIssues,
  children,
}: React.PropsWithChildren<EodWizardLayoutProps>) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.panel,
        padding: 14,
        gap: 12,
      }}
    >
      <View
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, gap: 6, paddingRight: 12 }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                color: colors.teal,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Step {currentStep + 1} / {totalSteps}
            </Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>{title}</Text>
            <Text style={{ fontSize: 12, color: colors.label }}>{subtitle}</Text>
          </View>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.screen,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.teal }}>
              {currentStep + 1}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }}>{children}</View>

      <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity
            onPress={onBack}
            disabled={!canGoBack}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              alignItems: "center",
              justifyContent: "center",
              opacity: canGoBack ? 1 : 0.4,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ArrowLeft size={16} color={colors.label} />
              <Text style={{ fontWeight: "600", fontSize: 12, color: colors.label }}>Back</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onNext}
            disabled={!canGoNext || isNextLoading}
            style={{
              flex: 2,
              paddingVertical: 12,
              borderRadius: 10,
              backgroundColor: canGoNext ? colors.teal : colors.teal + "66",
              alignItems: "center",
              justifyContent: "center",
              opacity: canGoNext ? 1 : 0.4,
            }}
          >
            {isNextLoading ? (
              <ActivityIndicator color={colors.onSolid} />
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontWeight: "600", fontSize: 12, color: colors.onSolid }}>
                  {nextLabel}
                </Text>
                <ArrowRight size={16} color={colors.onSolid} />
              </View>
            )}
          </TouchableOpacity>
        </View>
        {!canGoNext && hasBlockingItems && onContinueWithIssues ? (
          <TouchableOpacity
            onPress={onContinueWithIssues}
            style={{
              paddingVertical: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.warning + "50",
              backgroundColor: colors.warning + "15",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.warning }}>
              Continue with issues
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

