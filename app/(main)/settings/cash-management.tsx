/**
 * Cash Management Settings Screen
 *
 * Configure cash drawer behavior: No Sale rules, blind counting,
 * variance thresholds, and EOD requirements.
 * Also allows assigning cash drawers (from device_catalog) to stations.
 */

import CashDrawerSheet from "@/components/cash-drawer/CashDrawerSheet";
import { Switch } from "@/components/ui/switch";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors } from "@/lib/theme";
import { hydrateDrawerSession } from "@/services/cashDrawerService";
import { useCashDrawerStore } from "@/stores/useCashDrawerStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { Station } from "@/types/station";
import { formatCurrency } from "@/utils/currency";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  DollarSign,
  FileText,
  Lock,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Unlock,
  X,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CashDrawerRow {
  id: string;
  name: string;
  station_id: string | null;
  is_active: boolean | null;
  device_id: string | null;
  device_catalog: {
    model_name: string;
    manufacturer: string;
  } | null;
}

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

  const queryClient = useQueryClient();

  // ─── Station list ─────────────────────────────────────────────────────────
  const { data: stations = [], isLoading: loadingStations } = useQuery<Station[]>({
    queryKey: ["stations-cash-mgmt", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return [];
      const { data, error } = await supabase.rpc(
        "get_location_stations_with_status",
        { p_location_id: selectedStore.id },
      );
      if (error) throw error;
      return (data as Station[]) || [];
    },
    enabled: !!selectedStore?.id,
    staleTime: 60000,
  });

  // ─── Cash drawers for this location ──────────────────────────────────────
  const { data: cashDrawers = [], isLoading: loadingDrawers, refetch: refetchDrawers } = useQuery<CashDrawerRow[]>({
    queryKey: ["cash-drawers-location", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return [];
      const { data, error } = await supabase
        .from("cash_drawers")
        .select("id, name, station_id, is_active, device_id, device_catalog(model_name, manufacturer)")
        .eq("location_id", selectedStore.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data as CashDrawerRow[]) || [];
    },
    enabled: !!selectedStore?.id,
    staleTime: 30000,
  });

  // ─── Assignment modal state ───────────────────────────────────────────────
  const [assigningStation, setAssigningStation] = useState<Station | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  const handleAssignDrawer = useCallback(async (drawer: CashDrawerRow) => {
    if (!assigningStation || !selectedStore || !selectedStation) return;
    setIsAssigning(true);
    try {
      // Unassign any drawer currently on this station
      await supabase
        .from("cash_drawers")
        .update({ station_id: null })
        .eq("station_id", assigningStation.id);

      // Assign the chosen drawer to this station
      const { error } = await supabase
        .from("cash_drawers")
        .update({ station_id: assigningStation.id })
        .eq("id", drawer.id);
      if (error) throw error;

      // If this is the current station, re-hydrate the drawer session
      if (assigningStation.id === selectedStation.id) {
        await hydrateDrawerSession(supabase, selectedStation.id, selectedStore.id);
      }

      queryClient.invalidateQueries({ queryKey: ["cash-drawers-location", selectedStore.id] });
      setAssigningStation(null);
    } catch (err) {
      console.error("[CashMgmt] assign drawer error:", err);
    } finally {
      setIsAssigning(false);
    }
  }, [assigningStation, selectedStation, selectedStore, supabase, queryClient]);

  const handleUnassignDrawer = useCallback(async (station: Station) => {
    if (!selectedStore) return;
    try {
      await supabase
        .from("cash_drawers")
        .update({ station_id: null })
        .eq("station_id", station.id);

      if (selectedStation?.id === station.id) {
        await hydrateDrawerSession(supabase, station.id, selectedStore.id);
      }
      queryClient.invalidateQueries({ queryKey: ["cash-drawers-location", selectedStore.id] });
    } catch (err) {
      console.error("[CashMgmt] unassign drawer error:", err);
    }
  }, [selectedStation, selectedStore, supabase, queryClient]);

  const [expandedSections, setExpandedSections] = useState({
    assignment: true,
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
        {/* ── Cash Register Assignment ── */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader(
            "Cash Register Assignment",
            <Monitor size={20} color={colors.info} />,
            "assignment"
          )}
          {expandedSections.assignment && (
            <View className="p-5">
              <Text className="text-gray-500 text-xs mb-4">
                Assign a physical cash drawer to each station. Only drawers registered for this location are shown.
              </Text>

              {(loadingStations || loadingDrawers) ? (
                <View className="items-center py-6">
                  <ActivityIndicator color={colors.info} />
                  <Text className="text-gray-500 text-xs mt-2">Loading stations…</Text>
                </View>
              ) : stations.length === 0 ? (
                <Text className="text-gray-500 text-sm text-center py-4">No stations found for this location.</Text>
              ) : (
                stations.map((station) => {
                  const assignedDrawer = cashDrawers.find((d) => d.station_id === station.id);
                  const isCurrentStation = station.id === selectedStation?.id;

                  return (
                    <View
                      key={station.id}
                      className={`mb-3 rounded-xl border overflow-hidden ${
                        isCurrentStation ? "border-blue-500/50" : "border-gray-700"
                      }`}
                    >
                      {/* Station header */}
                      <View className={`flex-row items-center justify-between px-4 py-3 ${
                        isCurrentStation ? "bg-blue-600/10" : "bg-surface"
                      }`}>
                        <View className="flex-1">
                          <View className="flex-row items-center gap-2">
                            <Text className="text-white font-semibold text-sm">
                              {station.station_name}
                            </Text>
                            {isCurrentStation && (
                              <View className="bg-blue-600/30 px-1.5 py-0.5 rounded">
                                <Text className="text-blue-300 text-[10px] font-bold">This Station</Text>
                              </View>
                            )}
                          </View>
                          <Text className="text-gray-500 text-xs mt-0.5 capitalize">
                            {station.station_type} · #{station.station_number}
                          </Text>
                        </View>
                        {/* Assigned drawer badge or assign button */}
                        {assignedDrawer ? (
                          <TouchableOpacity
                            onPress={() => handleUnassignDrawer(station)}
                            className="flex-row items-center gap-1.5 bg-teal/15 border border-teal/40 px-3 py-1.5 rounded-lg"
                          >
                            <Check size={13} color={colors.teal} />
                            <Text className="text-teal text-xs font-semibold" numberOfLines={1}>
                              {assignedDrawer.name}
                            </Text>
                            <X size={11} color={colors.teal} />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setAssigningStation(station)}
                            className="flex-row items-center gap-1.5 bg-surface border border-gray-600 px-3 py-1.5 rounded-lg"
                          >
                            <Text className="text-gray-400 text-xs">Assign drawer</Text>
                            <ChevronRight size={13} color={colors.muted} />
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Drawer detail row (when assigned) */}
                      {assignedDrawer && (
                        <View className="flex-row items-center gap-2 px-4 py-2 bg-surface/40 border-t border-gray-700/50">
                          <Banknote size={12} color={colors.muted} />
                          <Text className="text-gray-500 text-xs">
                            {assignedDrawer.device_catalog
                              ? `${assignedDrawer.device_catalog.manufacturer} ${assignedDrawer.device_catalog.model_name}`
                              : "Hardware not specified"}
                          </Text>
                          <Text className="text-gray-700 text-xs mx-1">·</Text>
                          <Text className="text-gray-600 text-xs">Tap badge to unassign</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}

              {cashDrawers.length === 0 && !loadingDrawers && (
                <View className="mt-2 bg-surface rounded-xl border border-gray-700 px-4 py-3">
                  <Text className="text-gray-400 text-sm font-medium">No cash drawers found</Text>
                  <Text className="text-gray-600 text-xs mt-0.5">
                    Add drawer records to the cash_drawers table for this location to enable assignment.
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

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

    {/* ── Drawer Picker Modal ── */}
    <Modal
      visible={!!assigningStation}
      transparent
      animationType="fade"
      onRequestClose={() => setAssigningStation(null)}
    >
      <TouchableOpacity
        className="flex-1 bg-black/60 items-center justify-center px-6"
        activeOpacity={1}
        onPress={() => !isAssigning && setAssigningStation(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          className="w-full bg-panel rounded-2xl border border-gray-700 overflow-hidden"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-gray-700">
            <View>
              <Text className="text-white font-bold text-base">Assign Cash Drawer</Text>
              {assigningStation && (
                <Text className="text-gray-500 text-xs mt-0.5">
                  → {assigningStation.station_name}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setAssigningStation(null)} className="p-1">
              <X size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Drawer list */}
          <View className="p-4">
            {cashDrawers.length === 0 ? (
              <Text className="text-gray-500 text-sm text-center py-4">
                No available drawers for this location.
              </Text>
            ) : (
              cashDrawers.map((drawer) => {
                const isAssignedElsewhere = drawer.station_id !== null && drawer.station_id !== assigningStation?.id;
                const isAssignedHere = drawer.station_id === assigningStation?.id;
                const occupiedByStation = isAssignedElsewhere
                  ? stations.find((s) => s.id === drawer.station_id)
                  : null;

                return (
                  <TouchableOpacity
                    key={drawer.id}
                    onPress={() => !isAssignedElsewhere && !isAssigning && handleAssignDrawer(drawer)}
                    disabled={isAssignedElsewhere || isAssigning}
                    className={`flex-row items-center mb-2.5 px-4 py-3 rounded-xl border ${
                      isAssignedHere
                        ? "bg-teal/10 border-teal/40"
                        : isAssignedElsewhere
                          ? "bg-surface border-gray-700 opacity-50"
                          : "bg-surface border-gray-600"
                    }`}
                  >
                    <View className="flex-1">
                      <Text className={`font-semibold text-sm ${isAssignedElsewhere ? "text-gray-500" : "text-white"}`}>
                        {drawer.name}
                      </Text>
                      <Text className="text-gray-500 text-xs mt-0.5">
                        {drawer.device_catalog
                          ? `${drawer.device_catalog.manufacturer} ${drawer.device_catalog.model_name}`
                          : "No hardware model"}
                        {isAssignedElsewhere && occupiedByStation
                          ? ` · In use at ${occupiedByStation.station_name}`
                          : ""}
                      </Text>
                    </View>
                    {isAssigning && isAssignedHere ? (
                      <ActivityIndicator size="small" color={colors.teal} />
                    ) : isAssignedHere ? (
                      <Check size={16} color={colors.teal} />
                    ) : isAssignedElsewhere ? (
                      <Lock size={14} color={colors.muted} />
                    ) : (
                      <ChevronRight size={16} color={colors.muted} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
    </>
  );
}
