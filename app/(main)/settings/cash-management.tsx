/**
 * Cash Management Settings Screen
 *
 * Configure cash drawer behavior: No Sale rules, blind counting,
 * variance thresholds, and EOD requirements.
 */

import CashDrawerSheet from "@/components/cash-drawer/CashDrawerSheet";
import { Switch } from "@/components/ui/switch";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors } from "@/lib/theme";
import { hydrateDrawerSession } from "@/services/cashDrawerService";
import { useCashDrawerStore } from "@/stores/useCashDrawerStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { formatCurrency } from "@/utils/currency";
import {
  Banknote,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  DollarSign,
  Eye,
  FileText,
  Lock,
  RefreshCw,
  ShieldCheck,
  Unlock,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function CashManagementScreen() {
  const supabase = useSupabaseClient();
  const cashDrawerSettings = useStoreSettingsStore((s) => s.cashDrawerSettings);
  const updateCashDrawerSettings = useStoreSettingsStore(
    (s) => s.updateCashDrawerSettings
  );
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);

  const drawerId = useCashDrawerStore((s) => s.drawerId);
  const drawerName = useCashDrawerStore((s) => s.drawerName);
  const activeSession = useCashDrawerStore((s) => s.activeSession);
  const getRunningBalance = useCashDrawerStore((s) => s.getRunningBalance);
  const operations = useCashDrawerStore((s) => s.operations);

  const isSessionOpen = activeSession?.status === "open";

  const [isCashDrawerSheetOpen, setCashDrawerSheetOpen] = useState(false);
  const [isRefreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!selectedStation || !selectedStore || isRefreshing) return;
    setRefreshing(true);
    await hydrateDrawerSession(supabase, selectedStation.id, selectedStore.id);
    setRefreshing(false);
  }, [selectedStation, selectedStore, supabase, isRefreshing]);

  const [expandedSections, setExpandedSections] = useState({
    session: true,
    noSale: true,
    drawer: true,
    variance: false,
    eod: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const renderSectionHeader = (
    title: string,
    icon: React.ReactNode,
    section: keyof typeof expandedSections
  ) => (
    <TouchableOpacity
      onPress={() => toggleSection(section)}
      className="flex-row items-center justify-between p-4 bg-surface rounded-t-xl border-b border-gray-700"
    >
      <View className="flex-row items-center">
        <View className="w-8 h-8 bg-card rounded-lg items-center justify-center mr-3">
          {icon}
        </View>
        <Text className="text-white font-bold text-lg">{title}</Text>
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={20} color={colors.label} />
      ) : (
        <ChevronDown size={20} color={colors.label} />
      )}
    </TouchableOpacity>
  );

  const renderToggleRow = (
    label: string,
    description: string,
    value: boolean,
    onToggle: (v: boolean) => void
  ) => (
    <View className="flex-row items-center justify-between py-3 border-b border-gray-800">
      <View className="flex-1 mr-4">
        <Text className="text-white text-base">{label}</Text>
        <Text className="text-gray-500 text-xs mt-0.5">{description}</Text>
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </View>
  );

  const renderNumberRow = (
    label: string,
    description: string,
    value: number,
    onChange: (v: number) => void,
    prefix?: string
  ) => (
    <View className="flex-row items-center justify-between py-3 border-b border-gray-800">
      <View className="flex-1 mr-4">
        <Text className="text-white text-base">{label}</Text>
        <Text className="text-gray-500 text-xs mt-0.5">{description}</Text>
      </View>
      <View className="flex-row items-center">
        {prefix && <Text className="text-label mr-1">{prefix}</Text>}
        <TextInput
          value={String(value)}
          onChangeText={(t) => {
            const num = parseFloat(t);
            if (!isNaN(num)) onChange(num);
          }}
          keyboardType="decimal-pad"
          className="w-20 h-9 px-2 bg-surface border border-border rounded-lg text-white text-center text-sm"
        />
      </View>
    </View>
  );

  return (
    <>
    <View className="flex-1 bg-screen p-6">
      <View className="mb-6">
        <View className="flex-row items-center justify-between">
          <Text className="text-3xl font-bold text-white">Cash Management</Text>
          <TouchableOpacity
            onPress={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-panel border border-border"
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <RefreshCw size={20} color="white" />
            )}
          </TouchableOpacity>
        </View>
        <Text className="text-gray-400 mt-2">
          Configure cash drawer operations, approval rules, and reconciliation settings.
        </Text>
      </View>

      <View className="h-px w-full bg-gray-700 mb-6" />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Drawer Session */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader(
            "Drawer Session",
            <CircleDollarSign size={20} color={colors.teal} />,
            "session"
          )}
          {expandedSections.session && (
            <View className="p-5">
              {!drawerId ? (
                <Text className="text-gray-500 text-sm italic">
                  No cash drawer assigned to this station.
                </Text>
              ) : !isSessionOpen ? (
                <View>
                  <View className="flex-row items-center justify-between mb-3">
                    <View>
                      <Text className="text-white text-base font-semibold">
                        {drawerName || "Cash Drawer"}
                      </Text>
                      <Text className="text-gray-500 text-sm">Closed</Text>
                    </View>
                    <View className="flex-row items-center">
                      <Lock size={16} color={colors.muted} />
                      <Text className="text-gray-500 text-sm ml-1">Closed</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setCashDrawerSheetOpen(true)}
                    className="py-3 rounded-xl items-center bg-teal"
                  >
                    <View className="flex-row items-center gap-2">
                      <Unlock size={18} color="black" />
                      <Text className="text-base font-bold text-black">Open Drawer</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <View className="flex-row items-center justify-between mb-3">
                    <View>
                      <Text className="text-white text-base font-semibold">
                        {drawerName || "Cash Drawer"}
                      </Text>
                      <View className="flex-row items-center mt-0.5">
                        <View className="w-2 h-2 rounded-full bg-green-400 mr-1.5" />
                        <Text className="text-green-400 text-sm">Open</Text>
                      </View>
                    </View>
                    <View className="items-end">
                      <Text className="text-gray-500 text-xs">Running Balance</Text>
                      <Text className="text-teal text-lg font-bold">
                        {formatCurrency(getRunningBalance())}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setCashDrawerSheetOpen(true)}
                    className="py-3 rounded-xl items-center bg-surface border border-border"
                  >
                    <Text className="text-base font-semibold text-white">Manage Drawer</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        {/* No Sale Settings */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader(
            "No Sale Settings",
            <ShieldCheck size={20} color={colors.info} />,
            "noSale"
          )}
          {expandedSections.noSale && (
            <View className="p-5">
              {renderToggleRow(
                "Require Reason",
                "Staff must select a reason for No Sale operations",
                cashDrawerSettings.requireNoSaleReason,
                (v) => updateCashDrawerSettings({ requireNoSaleReason: v })
              )}
              {renderToggleRow(
                "Require Manager Approval",
                "Manager PIN required for No Sale operations",
                cashDrawerSettings.requireNoSaleApproval,
                (v) => updateCashDrawerSettings({ requireNoSaleApproval: v })
              )}
              {renderToggleRow(
                "Auto-Print No Sale Receipt",
                "Print a receipt when a No Sale is performed",
                cashDrawerSettings.autoPrintNoSaleReceipt,
                (v) => updateCashDrawerSettings({ autoPrintNoSaleReceipt: v })
              )}
              {renderNumberRow(
                "Alert Threshold",
                "Alert after this many No Sales per session",
                cashDrawerSettings.noSaleAlertThreshold,
                (v) => updateCashDrawerSettings({ noSaleAlertThreshold: v })
              )}
            </View>
          )}
        </View>

        {/* Drawer Settings */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader(
            "Drawer Settings",
            <Banknote size={20} color={colors.success} />,
            "drawer"
          )}
          {expandedSections.drawer && (
            <View className="p-5">
              {renderToggleRow(
                "Blind Close Count",
                "Hide expected amount during closing count",
                cashDrawerSettings.blindCloseCount,
                (v) => updateCashDrawerSettings({ blindCloseCount: v })
              )}
              {renderNumberRow(
                "Default Opening Amount",
                "Pre-filled amount for Quick Start opening",
                cashDrawerSettings.defaultOpeningAmount,
                (v) => updateCashDrawerSettings({ defaultOpeningAmount: v }),
                "$"
              )}
            </View>
          )}
        </View>

        {/* Variance Thresholds */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader(
            "Variance Thresholds",
            <DollarSign size={20} color="#facc15" />,
            "variance"
          )}
          {expandedSections.variance && (
            <View className="p-5">
              {renderNumberRow(
                "Warning Threshold",
                "Show yellow warning when variance exceeds this amount",
                cashDrawerSettings.varianceWarningThreshold,
                (v) => updateCashDrawerSettings({ varianceWarningThreshold: v }),
                "$"
              )}
              {renderNumberRow(
                "Alert Threshold",
                "Show red alert when variance exceeds this amount",
                cashDrawerSettings.varianceAlertThreshold,
                (v) => updateCashDrawerSettings({ varianceAlertThreshold: v }),
                "$"
              )}
            </View>
          )}
        </View>

        {/* EOD Settings */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader(
            "End of Day",
            <FileText size={20} color={colors.label} />,
            "eod"
          )}
          {expandedSections.eod && (
            <View className="p-5">
              {renderToggleRow(
                "Require EOD Before Close",
                "Cash drawer must be closed through End of Day process",
                cashDrawerSettings.requireEodBeforeClose,
                (v) => updateCashDrawerSettings({ requireEodBeforeClose: v })
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>

    <CashDrawerSheet
      isOpen={isCashDrawerSheetOpen}
      onClose={() => setCashDrawerSheetOpen(false)}
    />
    </>
  );
}
