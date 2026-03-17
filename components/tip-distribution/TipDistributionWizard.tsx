/**
 * TipDistributionWizard
 *
 * 4-step flow: Cash Tip Declaration -> Calculate -> Review/Adjust -> Approve
 * Supports both individual tips (with tip-outs) and tip pooling.
 */

import { colors, bottomSheetTheme } from "@/lib/theme";
import { formatCurrency } from "@/utils/currency";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  TipWizardStep,
  useTipDistributionStore,
} from "@/stores/useTipDistributionStore";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import {
  Calculator,
  Check,
  CheckCircle,
  ChevronRight,
  DollarSign,
  Edit3,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

interface TipDistributionWizardProps {
  isOpen: boolean;
  onClose: () => void;
  sessionDate?: string; // defaults to today
}

const STEPS: { key: TipWizardStep; label: string; icon: React.ReactNode }[] = [
  { key: "declare", label: "Declare", icon: <DollarSign size={16} color="white" /> },
  { key: "calculate", label: "Calculate", icon: <Calculator size={16} color="white" /> },
  { key: "review", label: "Review", icon: <Edit3 size={16} color="white" /> },
  { key: "approve", label: "Approve", icon: <CheckCircle size={16} color="white" /> },
];

const TipDistributionWizard: React.FC<TipDistributionWizardProps> = ({
  isOpen,
  onClose,
  sessionDate,
}) => {
  const sheetRef = useRef<BottomSheetModal>(null);
  const supabase = useSupabaseClient();

  const wizardStep = useTipDistributionStore((s) => s.wizardStep);
  const currentSession = useTipDistributionStore((s) => s.currentSession);
  const cashTipDeclarations = useTipDistributionStore((s) => s.cashTipDeclarations);
  const isCalculating = useTipDistributionStore((s) => s.isCalculating);
  const declareCashTips = useTipDistributionStore((s) => s.declareCashTips);
  const setWizardStep = useTipDistributionStore((s) => s.setWizardStep);
  const calculateDistribution = useTipDistributionStore((s) => s.calculateDistribution);
  const approveDistribution = useTipDistributionStore((s) => s.approveDistribution);
  const updateDetailAdjustment = useTipDistributionStore((s) => s.updateDetailAdjustment);
  const reset = useTipDistributionStore((s) => s.reset);

  const employees = useEmployeeStore((s) => s.employees);
  const loggedInEmployee = useEmployeeStore((s) => s.loggedInEmployee);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  const date = sessionDate || new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [isOpen]);

  const handleCalculate = useCallback(async () => {
    if (!selectedStore || !loggedInEmployee) return;
    await calculateDistribution(
      supabase,
      selectedStore.id,
      selectedStore.merchant_id,
      date,
      loggedInEmployee.profileId
    );
  }, [supabase, selectedStore, loggedInEmployee, date, calculateDistribution]);

  const handleApprove = useCallback(async () => {
    if (!currentSession || !loggedInEmployee) return;
    await approveDistribution(
      supabase,
      currentSession.id,
      loggedInEmployee.profileId
    );
  }, [supabase, currentSession, loggedInEmployee, approveDistribution]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // Step indicator
  const stepIndex = STEPS.findIndex((s) => s.key === wizardStep);

  const renderStepIndicator = () => (
    <View className="flex-row items-center justify-center gap-2 mb-6">
      {STEPS.map((step, i) => (
        <React.Fragment key={step.key}>
          <TouchableOpacity
            onPress={() => i <= stepIndex && setWizardStep(step.key)}
            disabled={i > stepIndex}
            className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${
              i === stepIndex
                ? "bg-teal"
                : i < stepIndex
                ? "bg-green-800"
                : "bg-gray-700"
            }`}
          >
            {step.icon}
            <Text
              className={`text-sm font-semibold ${
                i === stepIndex ? "text-black" : "text-white"
              }`}
            >
              {step.label}
            </Text>
          </TouchableOpacity>
          {i < STEPS.length - 1 && (
            <ChevronRight size={16} color={colors.muted} />
          )}
        </React.Fragment>
      ))}
    </View>
  );

  // Step 1: Cash Tip Declarations
  const renderDeclareStep = () => (
    <View>
      <Text className="text-xl font-bold text-white mb-2">
        Cash Tip Declarations
      </Text>
      <Text className="text-sm text-label mb-4">
        Enter the cash tips declared by each server for {date}.
      </Text>

      {employees
        .filter((e) => e.shiftStatus === "clocked_in" || e.shiftStatus === "clocked_out")
        .map((emp) => (
          <View
            key={emp.id}
            className="flex-row items-center py-3 border-b border-border"
          >
            <View className="flex-1">
              <Text className="text-base font-semibold text-white">
                {emp.displayName}
              </Text>
              <Text className="text-xs text-label capitalize">
                {emp.role.replace("merchant.", "")}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text className="text-base text-label">$</Text>
              <TextInput
                value={
                  cashTipDeclarations[emp.profileId] !== undefined
                    ? String(cashTipDeclarations[emp.profileId])
                    : ""
                }
                onChangeText={(text) => {
                  const num = parseFloat(text);
                  declareCashTips(emp.profileId, isNaN(num) ? 0 : num);
                }}
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                className="w-24 h-10 px-3 bg-surface border border-border rounded-lg text-white text-base text-right"
              />
            </View>
          </View>
        ))}

      <TouchableOpacity
        onPress={() => {
          setWizardStep("calculate");
          handleCalculate();
        }}
        disabled={isCalculating}
        className={`mt-6 py-4 rounded-xl items-center flex-row justify-center gap-2 ${
          isCalculating ? "bg-gray-600" : "bg-teal"
        }`}
      >
        <Calculator size={20} color="black" />
        <Text className="text-lg font-bold text-black">
          {isCalculating ? "Calculating..." : "Calculate Distribution"}
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Step 2: Calculating (auto-transitions to review)
  const renderCalculateStep = () => (
    <View className="items-center py-12">
      <Calculator size={48} color={colors.teal} />
      <Text className="text-xl font-bold text-white mt-4">
        Calculating Distribution...
      </Text>
      <Text className="text-sm text-label mt-2">
        Processing tip-out rules and pool configurations.
      </Text>
    </View>
  );

  // Step 3: Review & Adjust
  const renderReviewStep = () => {
    if (!currentSession) return null;

    return (
      <View>
        <Text className="text-xl font-bold text-white mb-2">
          Review Distribution
        </Text>

        {/* Summary */}
        <View className="bg-surface border border-border rounded-xl p-4 mb-4">
          <View className="flex-row justify-between mb-2">
            <Text className="text-sm text-label">Total Tips Collected</Text>
            <Text className="text-base font-semibold text-white">
              {formatCurrency(currentSession.totalTipsCollected)}
            </Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-sm text-label">Total Tip-Outs</Text>
            <Text className="text-base font-semibold text-white">
              {formatCurrency(currentSession.totalTipOuts)}
            </Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-sm text-label">Total Pooled</Text>
            <Text className="text-base font-semibold text-white">
              {formatCurrency(currentSession.totalTipsPooled)}
            </Text>
          </View>
          <View className="border-t border-border pt-2 mt-1">
            <View className="flex-row justify-between">
              <Text className="text-base font-bold text-white">
                Total Distributed
              </Text>
              <Text className="text-lg font-bold text-teal">
                {formatCurrency(currentSession.totalDistributed)}
              </Text>
            </View>
          </View>
        </View>

        {/* Per-employee details */}
        <Text className="text-base font-semibold text-white mb-2">
          Employee Breakdown
        </Text>
        {currentSession.details.map((detail) => (
          <View
            key={detail.id}
            className="bg-panel border border-border rounded-lg p-3 mb-2"
          >
            <View className="flex-row items-center justify-between mb-2">
              <View>
                <Text className="text-base font-semibold text-white">
                  {detail.staffName || detail.staffProfileId}
                </Text>
                <Text className="text-xs text-label capitalize">
                  {detail.roleCode.replace("merchant.", "")}
                </Text>
              </View>
              <Text className="text-lg font-bold text-teal">
                {formatCurrency(detail.netTips)}
              </Text>
            </View>

            {/* Breakdown row */}
            <View className="flex-row flex-wrap gap-x-4 gap-y-1">
              {detail.individualTipsEarned > 0 && (
                <Text className="text-xs text-label">
                  Earned: {formatCurrency(detail.individualTipsEarned)}
                </Text>
              )}
              {detail.tipOutGiven > 0 && (
                <Text className="text-xs text-red-400">
                  Tip-out: -{formatCurrency(detail.tipOutGiven)}
                </Text>
              )}
              {detail.tipOutReceived > 0 && (
                <Text className="text-xs text-green-400">
                  Received: +{formatCurrency(detail.tipOutReceived)}
                </Text>
              )}
              {detail.tipPoolReceived > 0 && (
                <Text className="text-xs text-blue-400">
                  Pool: +{formatCurrency(detail.tipPoolReceived)}
                </Text>
              )}
            </View>

            {/* Manual adjustment */}
            <View className="flex-row items-center mt-2 gap-2">
              <Text className="text-xs text-label">Adjustment:</Text>
              <TextInput
                value={
                  detail.manualAdjustment !== 0
                    ? String(detail.manualAdjustment)
                    : ""
                }
                onChangeText={(text) => {
                  const num = parseFloat(text);
                  updateDetailAdjustment(detail.id, isNaN(num) ? 0 : num);
                }}
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                className="w-20 h-8 px-2 bg-surface border border-border rounded text-white text-sm text-right"
              />
            </View>
          </View>
        ))}

        <TouchableOpacity
          onPress={handleApprove}
          className="mt-4 py-4 rounded-xl items-center flex-row justify-center gap-2 bg-green-700"
        >
          <Check size={20} color="white" />
          <Text className="text-lg font-bold text-white">
            Approve Distribution
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Step 4: Approved confirmation
  const renderApproveStep = () => (
    <View className="items-center py-12">
      <CheckCircle size={64} color={colors.success} />
      <Text className="text-2xl font-bold text-white mt-4">
        Distribution Approved
      </Text>
      <Text className="text-base text-label mt-2 text-center">
        Tips have been distributed for {date}.{"\n"}
        Total: {formatCurrency(currentSession?.totalDistributed || 0)}
      </Text>
      <TouchableOpacity
        onPress={handleClose}
        className="mt-8 py-3 px-8 rounded-xl bg-teal"
      >
        <Text className="text-lg font-bold text-black">Done</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={["75%", "92%"]}
      onDismiss={handleClose}
      enablePanDownToClose
      {...bottomSheetTheme}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.5}
        />
      )}
    >
      <BottomSheetScrollView contentContainerStyle={{ padding: 16 }}>
        {renderStepIndicator()}
        {wizardStep === "declare" && renderDeclareStep()}
        {wizardStep === "calculate" && renderCalculateStep()}
        {wizardStep === "review" && renderReviewStep()}
        {wizardStep === "approve" && renderApproveStep()}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
};

export default TipDistributionWizard;
