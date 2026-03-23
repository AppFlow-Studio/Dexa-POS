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
  pending: <Clock size={16} color={colors.muted} />,
  in_progress: <Loader2 size={16} color={colors.info} />,
  passed: <CheckCircle size={16} color={colors.success} />,
  failed: <AlertCircle size={16} color={colors.danger} />,
  skipped: <Check size={16} color={colors.muted} />,
};

const STATUS_BORDER: Record<ChecklistStatus, string> = {
  pending: colors.border,
  in_progress: colors.info,
  passed: colors.success,
  failed: colors.danger,
  skipped: colors.muted,
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
      <View
        style={{
          flex: 1,
          backgroundColor: colors.screen,
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
        }}
      >
        <Text
          style={{ fontSize: 15, fontWeight: "700", color: colors.heading, marginBottom: 8 }}
        >
          End of Day Closing
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: colors.label,
            textAlign: "center",
            marginBottom: 28,
            maxWidth: 380,
          }}
        >
          Run through the closing checklist to ensure everything is reconciled
          before ending the business day.
        </Text>
        <TouchableOpacity
          onPress={handleStart}
          style={{
            paddingVertical: 13,
            paddingHorizontal: 32,
            borderRadius: 10,
            backgroundColor: colors.teal,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#000000" }}>
            Begin Closing
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const completed = isComplete();
  const passed = passedCount();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.screen }}
      contentContainerStyle={{ padding: 16 }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <View>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
            End of Day Closing
          </Text>
          <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={isRefreshing}
            style={{
              padding: 8,
              borderRadius: 8,
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <RefreshCw
              size={16}
              color={isRefreshing ? colors.muted : colors.heading}
            />
          </TouchableOpacity>

          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 20,
              backgroundColor: colors.teal + "20",
              borderWidth: 1,
              borderColor: colors.teal + "50",
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>
              {passed}/{checklist.length} Complete
            </Text>
          </View>
        </View>
      </View>

      {/* Progress Bar */}
      <View
        style={{
          height: 6,
          backgroundColor: colors.border,
          borderRadius: 3,
          marginBottom: 14,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: "100%",
            backgroundColor: colors.teal,
            borderRadius: 3,
            width: `${(passed / Math.max(checklist.length, 1)) * 100}%`,
          }}
        />
      </View>

      {/* Checklist */}
      <View style={{ gap: 8, marginBottom: 14 }}>
        {checklist.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => handleItemAction(item.id)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 12,
              borderRadius: 10,
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderLeftWidth: 3,
              borderLeftColor: STATUS_BORDER[item.status],
            }}
          >
            <View style={{ marginRight: 10 }}>{STATUS_ICONS[item.status]}</View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                {item.label}
              </Text>
              <Text style={{ fontSize: 12, color: colors.label, marginTop: 1 }}>
                {item.description}
              </Text>
              {item.detail && (
                <Text
                  style={{
                    fontSize: 11,
                    marginTop: 2,
                    color: item.status === "failed" ? colors.danger : colors.label,
                  }}
                >
                  {item.detail}
                </Text>
              )}
            </View>
            <ChevronRight size={16} color={colors.muted} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Daily Summary (when available) */}
      {dailySummary && (
        <View style={{ marginTop: 4 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: colors.heading,
              marginBottom: 10,
            }}
          >
            Daily Summary
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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
            <View style={{ marginTop: 16 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: colors.heading,
                  marginBottom: 8,
                }}
              >
                Cash Drawer Summary
              </Text>
              <View style={{ gap: 8 }}>
                {dailySummary.drawerBreakdown.map((drawer, idx) => {
                  const absVariance = Math.abs(drawer.variance);
                  const varianceColor =
                    absVariance === 0
                      ? colors.success
                      : absVariance >= 20
                      ? colors.danger
                      : absVariance >= 5
                      ? colors.warning
                      : colors.info;

                  return (
                    <View
                      key={idx}
                      style={{
                        backgroundColor: colors.panel,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 10,
                        padding: 12,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: colors.heading,
                          marginBottom: 8,
                        }}
                      >
                        {drawer.drawerName}
                      </Text>
                      <View style={{ gap: 4 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 12, color: colors.label }}>Opening</Text>
                          <Text style={{ fontSize: 12, color: colors.heading }}>
                            {formatCurrency(drawer.opening)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 12, color: colors.label }}>Expected</Text>
                          <Text style={{ fontSize: 12, color: colors.heading }}>
                            {formatCurrency(drawer.expected)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 12, color: colors.label }}>Closing</Text>
                          <Text style={{ fontSize: 12, color: colors.heading }}>
                            {formatCurrency(drawer.closing)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.heading }}>
                            Variance
                          </Text>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: varianceColor }}>
                            {drawer.variance >= 0 ? "+" : ""}
                            {formatCurrency(drawer.variance)}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                          paddingTop: 8,
                          marginTop: 8,
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        <Text style={{ fontSize: 11, color: colors.label }}>
                          Sales: {formatCurrency(drawer.cashSales)}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.label }}>
                          Refunds: {formatCurrency(drawer.refunds)}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.label }}>
                          Pay In: {formatCurrency(drawer.payIns)}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.label }}>
                          Pay Out: {formatCurrency(drawer.payOuts)}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.label }}>
                          Drops: {formatCurrency(drawer.cashDrops)}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.label }}>
                          No Sales: {drawer.noSaleCount}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      )}

      {summaryLoading && (
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <ActivityIndicator size="large" color={colors.teal} />
          <Text style={{ fontSize: 12, color: colors.label, marginTop: 8 }}>
            Generating daily report...
          </Text>
        </View>
      )}

      {/* Completion state */}
      {completed && (
        <View
          style={{
            marginTop: 16,
            padding: 20,
            backgroundColor: colors.success + "15",
            borderWidth: 1,
            borderColor: colors.success + "40",
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <CheckCircle size={40} color={colors.success} />
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: colors.heading,
              marginTop: 10,
            }}
          >
            All Clear!
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: colors.label,
              textAlign: "center",
              marginTop: 4,
            }}
          >
            All closing tasks are complete. You can now end the business day.
          </Text>
          <TouchableOpacity
            style={{
              marginTop: 14,
              paddingVertical: 10,
              paddingHorizontal: 20,
              borderRadius: 10,
              backgroundColor: colors.teal,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Printer size={16} color="#000000" />
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#000000" }}>
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
    <View
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        padding: 10,
        minWidth: 110,
      }}
    >
      <Text style={{ fontSize: 11, color: colors.label }}>{label}</Text>
      <Text
        style={{ fontSize: 15, fontWeight: "700", color: colors.heading, marginTop: 2 }}
      >
        {value}
      </Text>
    </View>
  );
}
