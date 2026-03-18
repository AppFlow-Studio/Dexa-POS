/**
 * End-of-Day Closing Screen
 *
 * Guided checklist wizard that ties together:
 * - Table clearing
 * - Order closing
 * - Cash drawer reconciliation
 * - Tip distribution
 * - Shift review
 * - Daily report generation
 */

import CashDrawerSheet from "@/components/cash-drawer/CashDrawerSheet";
import TipDistributionWizard from "@/components/tip-distribution/TipDistributionWizard";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors } from "@/lib/theme";
import { formatCurrency } from "@/utils/currency";
import {
  fetchDailySummary,
  runChecklistValidations,
} from "@/services/endOfDayService";
import {
  ChecklistItemId,
  ChecklistStatus,
  useEndOfDayStore,
} from "@/stores/useEndOfDayStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  AlertCircle,
  Check,
  CheckCircle,
  ChevronRight,
  Clock,
  Loader2,
  Printer,
  RefreshCw,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const STATUS_ICONS: Record<ChecklistStatus, React.ReactNode> = {
  pending: <Clock size={20} color={colors.muted} />,
  in_progress: <Loader2 size={20} color={colors.info} />,
  passed: <CheckCircle size={20} color={colors.success} />,
  failed: <AlertCircle size={20} color={colors.danger} />,
  skipped: <Check size={20} color={colors.muted} />,
};

const STATUS_COLORS: Record<ChecklistStatus, string> = {
  pending: "border-border",
  in_progress: "border-blue-500",
  passed: "border-green-500",
  failed: "border-red-500",
  skipped: "border-gray-500",
};

export default function EndOfDayScreen() {
  const supabase = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  const checklist = useEndOfDayStore((s) => s.checklist);
  const isRunning = useEndOfDayStore((s) => s.isRunning);
  const dailySummary = useEndOfDayStore((s) => s.dailySummary);
  const summaryLoading = useEndOfDayStore((s) => s.summaryLoading);
  const initChecklist = useEndOfDayStore((s) => s.initChecklist);
  const updateChecklistItem = useEndOfDayStore((s) => s.updateChecklistItem);
  const setDailySummary = useEndOfDayStore((s) => s.setDailySummary);
  const setSummaryLoading = useEndOfDayStore((s) => s.setSummaryLoading);
  const isComplete = useEndOfDayStore((s) => s.isComplete);
  const passedCount = useEndOfDayStore((s) => s.passedCount);

  const [isCashDrawerOpen, setCashDrawerOpen] = useState(false);
  const [isTipWizardOpen, setTipWizardOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const locationId = selectedStore?.id;

  // Start EOD process
  const handleStart = useCallback(async () => {
    if (!locationId) return;
    initChecklist();
    setIsRefreshing(true);
    await runChecklistValidations(supabase, locationId);
    setIsRefreshing(false);
  }, [supabase, locationId, initChecklist]);

  // Refresh validations
  const handleRefresh = useCallback(async () => {
    if (!locationId) return;
    setIsRefreshing(true);
    await runChecklistValidations(supabase, locationId);
    setIsRefreshing(false);
  }, [supabase, locationId]);

  // Generate daily report
  const handleGenerateReport = useCallback(async () => {
    if (!locationId) return;
    setSummaryLoading(true);
    const summary = await fetchDailySummary(supabase, locationId);
    if (summary) {
      setDailySummary(summary);
      updateChecklistItem("report_generated", "passed");
    }
    setSummaryLoading(false);
  }, [supabase, locationId, setDailySummary, setSummaryLoading, updateChecklistItem]);

  // Handle checklist item action
  const handleItemAction = useCallback(
    (itemId: ChecklistItemId) => {
      switch (itemId) {
        case "cash_drawer_closed":
          setCashDrawerOpen(true);
          break;
        case "tips_distributed":
          setTipWizardOpen(true);
          break;
        case "report_generated":
          handleGenerateReport();
          break;
        default:
          // For other items, just refresh to re-check
          handleRefresh();
          break;
      }
    },
    [handleRefresh, handleGenerateReport]
  );

  // Not started state
  if (!isRunning) {
    return (
      <View className="flex-1 bg-screen items-center justify-center p-8">
        <Text className="text-3xl font-bold text-white mb-3">
          End of Day Closing
        </Text>
        <Text className="text-base text-label text-center mb-8 max-w-md">
          Run through the closing checklist to ensure everything is reconciled
          before ending the business day.
        </Text>
        <TouchableOpacity
          onPress={handleStart}
          className="py-4 px-8 rounded-xl bg-teal"
        >
          <Text className="text-xl font-bold text-black">Begin Closing</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const completed = isComplete();
  const passed = passedCount();

  return (
    <ScrollView className="flex-1 bg-screen" contentContainerStyle={{ padding: 16 }}>
      {/* Header */}
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-2xl font-bold text-white">
            End of Day Closing
          </Text>
          <Text className="text-sm text-label">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>
        </View>

        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-panel border border-border"
          >
            <RefreshCw
              size={20}
              color={isRefreshing ? colors.muted : "white"}
            />
          </TouchableOpacity>

          <View className="px-3 py-1.5 rounded-full bg-surface">
            <Text className="text-sm font-semibold text-white">
              {passed}/{checklist.length} Complete
            </Text>
          </View>
        </View>
      </View>

      {/* Progress Bar */}
      <View className="h-2 bg-gray-700 rounded-full mb-6 overflow-hidden">
        <View
          className="h-full bg-teal rounded-full"
          style={{ width: `${(passed / checklist.length) * 100}%` }}
        />
      </View>

      {/* Checklist */}
      {checklist.map((item) => (
        <TouchableOpacity
          key={item.id}
          onPress={() => handleItemAction(item.id)}
          className={`flex-row items-center p-4 mb-3 rounded-xl bg-panel border-l-4 ${STATUS_COLORS[item.status]}`}
        >
          <View className="mr-3">{STATUS_ICONS[item.status]}</View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-white">
              {item.label}
            </Text>
            <Text className="text-sm text-label">{item.description}</Text>
            {item.detail && (
              <Text
                className={`text-xs mt-1 ${
                  item.status === "failed" ? "text-red-400" : "text-label"
                }`}
              >
                {item.detail}
              </Text>
            )}
          </View>
          <ChevronRight size={18} color={colors.muted} />
        </TouchableOpacity>
      ))}

      {/* Daily Summary (when available) */}
      {dailySummary && (
        <View className="mt-4">
          <Text className="text-xl font-bold text-white mb-4">
            Daily Summary
          </Text>

          <View className="flex-row gap-3 flex-wrap">
            <SummaryCard label="Total Sales" value={formatCurrency(dailySummary.totalSales)} />
            <SummaryCard label="Orders" value={String(dailySummary.totalOrders)} />
            <SummaryCard label="Avg Order" value={formatCurrency(dailySummary.averageOrderValue)} />
            <SummaryCard label="Card Payments" value={formatCurrency(dailySummary.cardTotal)} />
            <SummaryCard label="Cash Payments" value={formatCurrency(dailySummary.cashTotal)} />
            <SummaryCard label="Tips" value={formatCurrency(dailySummary.totalTips)} />
            <SummaryCard label="Labor Hours" value={`${dailySummary.totalLaborHours.toFixed(1)}h`} />
            <SummaryCard label="Labor Cost" value={formatCurrency(dailySummary.totalLaborCost)} />
            <SummaryCard label="Staff" value={String(dailySummary.staffCount)} />
            <SummaryCard label="Refunds" value={formatCurrency(dailySummary.totalRefunds)} />
          </View>

          {/* Cash Drawer Breakdown */}
          {dailySummary.drawerBreakdown && dailySummary.drawerBreakdown.length > 0 && (
            <View className="mt-6">
              <Text className="text-lg font-bold text-white mb-3">
                Cash Drawer Summary
              </Text>
              {dailySummary.drawerBreakdown.map((drawer, idx) => {
                const absVariance = Math.abs(drawer.variance);
                const varianceColor =
                  absVariance === 0
                    ? "text-green-400"
                    : absVariance >= 20
                    ? "text-red-400"
                    : absVariance >= 5
                    ? "text-yellow-400"
                    : "text-blue-400";

                return (
                  <View
                    key={idx}
                    className="bg-panel border border-gray-700 rounded-xl p-4 mb-3"
                  >
                    <Text className="text-base font-bold text-white mb-2">
                      {drawer.drawerName}
                    </Text>
                    <View className="flex-row justify-between mb-1">
                      <Text className="text-sm text-label">Opening</Text>
                      <Text className="text-sm text-white">{formatCurrency(drawer.opening)}</Text>
                    </View>
                    <View className="flex-row justify-between mb-1">
                      <Text className="text-sm text-label">Expected</Text>
                      <Text className="text-sm text-white">{formatCurrency(drawer.expected)}</Text>
                    </View>
                    <View className="flex-row justify-between mb-1">
                      <Text className="text-sm text-label">Closing</Text>
                      <Text className="text-sm text-white">{formatCurrency(drawer.closing)}</Text>
                    </View>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-sm font-semibold text-white">Variance</Text>
                      <Text className={`text-sm font-bold ${varianceColor}`}>
                        {drawer.variance >= 0 ? "+" : ""}
                        {formatCurrency(drawer.variance)}
                      </Text>
                    </View>
                    <View className="border-t border-gray-700 pt-2 mt-1">
                      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                        <Text className="text-xs text-label">
                          Sales: {formatCurrency(drawer.cashSales)}
                        </Text>
                        <Text className="text-xs text-label">
                          Refunds: {formatCurrency(drawer.refunds)}
                        </Text>
                        <Text className="text-xs text-label">
                          Pay In: {formatCurrency(drawer.payIns)}
                        </Text>
                        <Text className="text-xs text-label">
                          Pay Out: {formatCurrency(drawer.payOuts)}
                        </Text>
                        <Text className="text-xs text-label">
                          Drops: {formatCurrency(drawer.cashDrops)}
                        </Text>
                        <Text className="text-xs text-label">
                          No Sales: {drawer.noSaleCount}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {summaryLoading && (
        <View className="items-center py-8">
          <ActivityIndicator size="large" color={colors.teal} />
          <Text className="text-sm text-label mt-2">
            Generating daily report...
          </Text>
        </View>
      )}

      {/* Completion state */}
      {completed && (
        <View className="mt-6 p-6 bg-green-900/20 border border-green-800 rounded-xl items-center">
          <CheckCircle size={48} color={colors.success} />
          <Text className="text-xl font-bold text-white mt-3">
            All Clear!
          </Text>
          <Text className="text-sm text-label text-center mt-1">
            All closing tasks are complete. You can now end the business day.
          </Text>
          <TouchableOpacity className="mt-4 py-3 px-6 rounded-xl bg-teal flex-row items-center gap-2">
            <Printer size={18} color="black" />
            <Text className="text-base font-bold text-black">
              Print EOD Report
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sub-sheets */}
      <CashDrawerSheet
        isOpen={isCashDrawerOpen}
        onClose={() => {
          setCashDrawerOpen(false);
          handleRefresh();
        }}
      />
      <TipDistributionWizard
        isOpen={isTipWizardOpen}
        onClose={() => {
          setTipWizardOpen(false);
          handleRefresh();
        }}
      />
    </ScrollView>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="bg-surface border border-border rounded-lg p-3 min-w-[120px]">
      <Text className="text-xs text-label">{label}</Text>
      <Text className="text-lg font-bold text-white mt-0.5">{value}</Text>
    </View>
  );
}
