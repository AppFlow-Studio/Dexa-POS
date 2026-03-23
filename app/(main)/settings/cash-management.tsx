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
      await supabase
        .from("cash_drawers")
        .update({ station_id: null })
        .eq("station_id", assigningStation.id);

      const { error } = await supabase
        .from("cash_drawers")
        .update({ station_id: assigningStation.id })
        .eq("id", drawer.id);
      if (error) throw error;

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
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 14,
        backgroundColor: colors.panel,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        borderBottomWidth: expandedSections[section] ? 1 : 0,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ width: 32, height: 32, backgroundColor: colors.teal + "15", borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 10 }}>
          {icon}
        </View>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>{title}</Text>
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={16} color={colors.label} />
      ) : (
        <ChevronDown size={16} color={colors.label} />
      )}
    </TouchableOpacity>
  );

  const renderToggleRow = (
    label: string,
    description: string,
    value: boolean,
    onToggle: (v: boolean) => void
  ) => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontSize: 13, color: colors.heading }}>{label}</Text>
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{description}</Text>
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
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontSize: 13, color: colors.heading }}>{label}</Text>
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{description}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {prefix && <Text style={{ fontSize: 13, color: colors.label, marginRight: 4 }}>{prefix}</Text>}
        <TextInput
          value={String(value)}
          onChangeText={(t) => {
            const num = parseFloat(t);
            if (!isNaN(num)) onChange(num);
          }}
          keyboardType="decimal-pad"
          style={{
            width: 72,
            height: 36,
            paddingHorizontal: 8,
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            color: colors.heading,
            fontSize: 13,
            textAlign: "center",
          }}
        />
      </View>
    </View>
  );

  return (
    <>
    <View style={{ flex: 1, backgroundColor: colors.screen, padding: 20 }}>
      {/* Header */}
      <View style={{ marginBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>Cash Management</Text>
          <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
            Configure cash drawer operations, approval rules, and reconciliation.
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleRefresh}
          disabled={isRefreshing}
          style={{ padding: 8, borderRadius: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={colors.teal} />
          ) : (
            <RefreshCw size={16} color={colors.label} />
          )}
        </TouchableOpacity>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 16 }} />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── Cash Register Assignment ── */}
        <View style={{ backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden" }}>
          {renderSectionHeader(
            "Cash Register Assignment",
            <Monitor size={16} color={colors.info} />,
            "assignment"
          )}
          {expandedSections.assignment && (
            <View style={{ padding: 14 }}>
              <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 12 }}>
                Assign a physical cash drawer to each station. Only drawers registered for this location are shown.
              </Text>

              {(loadingStations || loadingDrawers) ? (
                <View style={{ alignItems: "center", paddingVertical: 20 }}>
                  <ActivityIndicator color={colors.teal} />
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 8 }}>Loading stations…</Text>
                </View>
              ) : stations.length === 0 ? (
                <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", paddingVertical: 12 }}>No stations found for this location.</Text>
              ) : (
                stations.map((station) => {
                  const assignedDrawer = cashDrawers.find((d) => d.station_id === station.id);
                  const isCurrentStation = station.id === selectedStation?.id;

                  return (
                    <View
                      key={station.id}
                      style={{
                        marginBottom: 8,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: isCurrentStation ? colors.teal + "50" : colors.border,
                        overflow: "hidden",
                      }}
                    >
                      <View style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        backgroundColor: isCurrentStation ? colors.teal + "10" : colors.screen,
                      }}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                              {station.station_name}
                            </Text>
                            {isCurrentStation && (
                              <View style={{ backgroundColor: colors.teal + "20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ fontSize: 10, color: colors.teal, fontWeight: "700" }}>This Station</Text>
                              </View>
                            )}
                          </View>
                          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1, textTransform: "capitalize" }}>
                            {station.station_type} · #{station.station_number}
                          </Text>
                        </View>
                        {assignedDrawer ? (
                          <TouchableOpacity
                            onPress={() => handleUnassignDrawer(station)}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 5,
                              backgroundColor: colors.teal + "15",
                              borderWidth: 1,
                              borderColor: colors.teal + "40",
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 8,
                            }}
                          >
                            <Check size={12} color={colors.teal} />
                            <Text style={{ fontSize: 12, color: colors.teal, fontWeight: "600" }} numberOfLines={1}>
                              {assignedDrawer.name}
                            </Text>
                            <X size={10} color={colors.teal} />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setAssigningStation(station)}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 5,
                              backgroundColor: colors.screen,
                              borderWidth: 1,
                              borderColor: colors.border,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 8,
                            }}
                          >
                            <Text style={{ fontSize: 12, color: colors.label }}>Assign drawer</Text>
                            <ChevronRight size={12} color={colors.muted} />
                          </TouchableOpacity>
                        )}
                      </View>

                      {assignedDrawer && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.screen, borderTopWidth: 1, borderTopColor: colors.border }}>
                          <Banknote size={11} color={colors.muted} />
                          <Text style={{ fontSize: 11, color: colors.muted }}>
                            {assignedDrawer.device_catalog
                              ? `${assignedDrawer.device_catalog.manufacturer} ${assignedDrawer.device_catalog.model_name}`
                              : "Hardware not specified"}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.border, marginHorizontal: 2 }}>·</Text>
                          <Text style={{ fontSize: 11, color: colors.muted + "80" }}>Tap badge to unassign</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}

              {cashDrawers.length === 0 && !loadingDrawers && (
                <View style={{ marginTop: 8, backgroundColor: colors.screen, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 }}>
                  <Text style={{ fontSize: 13, color: colors.label, fontWeight: "500" }}>No cash drawers found</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                    Add drawer records to the cash_drawers table for this location to enable assignment.
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Drawer Session */}
        <View style={{ backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden" }}>
          {renderSectionHeader(
            "Drawer Session",
            <CircleDollarSign size={16} color={colors.teal} />,
            "session"
          )}
          {expandedSections.session && (
            <View style={{ padding: 14 }}>
              {!drawerId ? (
                <Text style={{ fontSize: 12, color: colors.muted, fontStyle: "italic" }}>
                  No cash drawer assigned to this station.
                </Text>
              ) : !isSessionOpen ? (
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                        {drawerName || "Cash Drawer"}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.label }}>Closed</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Lock size={14} color={colors.muted} />
                      <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 4 }}>Locked</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setCashDrawerSheetOpen(true)}
                    style={{ paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: colors.teal }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Unlock size={16} color="#000" />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#000" }}>Open Drawer</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                        {drawerName || "Cash Drawer"}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success, marginRight: 5 }} />
                        <Text style={{ fontSize: 12, color: colors.success }}>Open</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 11, color: colors.label }}>Running Balance</Text>
                      <Text style={{ fontSize: 17, fontWeight: "700", color: colors.teal }}>
                        {formatCurrency(getRunningBalance())}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setCashDrawerSheetOpen(true)}
                    style={{ paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>Manage Drawer</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        {/* No Sale Settings */}
        <View style={{ backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden" }}>
          {renderSectionHeader(
            "No Sale Settings",
            <ShieldCheck size={16} color={colors.info} />,
            "noSale"
          )}
          {expandedSections.noSale && (
            <View style={{ padding: 14 }}>
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
        <View style={{ backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden" }}>
          {renderSectionHeader(
            "Drawer Settings",
            <Banknote size={16} color={colors.success} />,
            "drawer"
          )}
          {expandedSections.drawer && (
            <View style={{ padding: 14 }}>
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
        <View style={{ backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden" }}>
          {renderSectionHeader(
            "Variance Thresholds",
            <DollarSign size={16} color={colors.warning} />,
            "variance"
          )}
          {expandedSections.variance && (
            <View style={{ padding: 14 }}>
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
        <View style={{ backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden" }}>
          {renderSectionHeader(
            "End of Day",
            <FileText size={16} color={colors.label} />,
            "eod"
          )}
          {expandedSections.eod && (
            <View style={{ padding: 14 }}>
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
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}
        activeOpacity={1}
        onPress={() => !isAssigning && setAssigningStation(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{ width: "100%", backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}
        >
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>Assign Cash Drawer</Text>
              {assigningStation && (
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                  → {assigningStation.station_name}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => setAssigningStation(null)} style={{ padding: 4 }}>
              <X size={16} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Drawer list */}
          <View style={{ padding: 14 }}>
            {cashDrawers.length === 0 ? (
              <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", paddingVertical: 16 }}>
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
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 8,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: isAssignedHere ? colors.teal + "40" : isAssignedElsewhere ? colors.border : colors.border,
                      backgroundColor: isAssignedHere ? colors.teal + "10" : colors.screen,
                      opacity: isAssignedElsewhere ? 0.5 : 1,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: isAssignedElsewhere ? colors.muted : colors.heading }}>
                        {drawer.name}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
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
                      <Check size={15} color={colors.teal} />
                    ) : isAssignedElsewhere ? (
                      <Lock size={13} color={colors.muted} />
                    ) : (
                      <ChevronRight size={15} color={colors.muted} />
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
