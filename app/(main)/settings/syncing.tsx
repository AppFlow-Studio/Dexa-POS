import { FailedSyncsPanel } from "@/components/settings/sync-status/FailedSyncsPanel";
import { SyncQueuePanel } from "@/components/settings/sync-status/SyncQueuePanel";
import { menuVersionQueryKey } from "@/hooks/pos/useMenuVersionWatch";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors, spinnerColor } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import { useUiScale } from "@/lib/uiScale";
import { syncEmployees } from "@/services/employeeSyncService";
import { FloorPlanService } from "@/services/floorPlanService";
import { syncNow } from "@/services/offlineSyncService";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, UtensilsCrossed } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const SyncingScreen: React.FC = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const queryClient = useQueryClient();
  const supabase = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  const [syncingKey, setSyncingKey] = useState<string | null>(null);

  const resyncFloorPlan = async () => {
    const locationId = selectedStore?.id;
    if (!supabase || !locationId) return;

    const { data: floorPlans, error } =
      await FloorPlanService.getLocationFloorPlans(supabase, locationId);
    if (error) throw error;

    const defaultPlan =
      floorPlans?.find((fp) => fp.is_default) || floorPlans?.[0];
    useFloorPlanStore.getState().setFloorPlans(floorPlans || []);
    useFloorPlanStore.getState().setActiveFloorPlanId(defaultPlan?.id || null);

    if (defaultPlan?.id) {
      await useFloorPlanStore.getState().setActiveFloorPlan(defaultPlan.id);
    }
  };

  const handleSyncAll = async () => {
    if (!selectedStore?.id) return;
    setSyncingKey("all");
    console.log(
      `[SyncingScreen] Employee/PIN sync firing (manual Sync POS): ${selectedStore.id}`,
    );
    const tasks: Promise<unknown>[] = [
      syncNow(),
      resyncFloorPlan(),
      syncEmployees(supabase, selectedStore.id),
      queryClient.invalidateQueries({
        queryKey: ["active_orders", selectedStore.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ["pos_sync", selectedStore.id],
      }),
      queryClient.invalidateQueries({ queryKey: ["standalone_sync"] }),
      queryClient.invalidateQueries({
        queryKey: [
          "service_charge_rules",
          selectedStore.merchant_id,
          selectedStore.id,
        ],
      }),
    ];
    const results = await Promise.allSettled(tasks);
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      toastService.show({
        title: "POS Synced",
        message: "Orders, menus, settings, and floor plan are up to date.",
        type: "success",
      });
    } else {
      toastService.show({
        title:
          failed === results.length ? "Sync Failed" : "Sync Partially Failed",
        message: `${failed} of ${results.length} sync tasks failed. Check your connection and try again.`,
        type: "error",
      });
    }
    setSyncingKey(null);
  };

  /**
   * On-demand version probe — the manual counterpart to useMenuVersionWatch's
   * poll, for when someone has just edited a price and does not want to wait out
   * the interval.
   *
   * Reports honestly rather than always claiming success: it compares the live
   * watermark against the one already applied, and only pulls the menu when they
   * differ. "Menu Up to Date" is a real answer here, not a fallback.
   */
  const handleCheckMenuChanges = async () => {
    const locationId = selectedStore?.id;
    if (!supabase || !locationId) return;
    setSyncingKey("menu_version");
    try {
      const { data, error } = await supabase.rpc("get_pos_menu_version_v1", {
        p_location_id: locationId,
      });
      if (error) throw error;

      const remoteVersion = (data as string | null) ?? null;
      const appliedVersion =
        queryClient.getQueryData<{ version?: string | null }>([
          "pos_sync",
          locationId,
        ])?.version ?? null;

      if (remoteVersion && appliedVersion && remoteVersion === appliedVersion) {
        toastService.show({
          title: "Menu Up to Date",
          message: "No menu or price changes since the last sync.",
          type: "success",
        });
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["pos_sync", locationId],
      });
      // The version probe is now the baseline for the background watcher too,
      // so it does not re-detect this same change on its next tick.
      await queryClient.invalidateQueries({
        queryKey: menuVersionQueryKey(locationId),
      });
      toastService.show({
        title: "Menu Updated",
        message: "Menu and prices have been refreshed.",
        type: "success",
      });
    } catch (e) {
      console.error("[SyncingScreen] menu version check failed:", e);
      toastService.show({
        title: "Check Failed",
        message:
          "Could not check for menu changes. Check your connection and try again.",
        type: "error",
      });
    } finally {
      setSyncingKey(null);
    }
  };

  const renderSyncButton = (
    label: string,
    subtitle: string,
    icon: React.ReactNode,
    key: string,
    onPress: () => void,
  ) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={syncingKey !== null}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: s(12),
        paddingVertical: s(9),
        backgroundColor: colors.screen,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: s(10),
        marginBottom: s(8),
      }}
    >
      <View
        style={{
          width: s(32),
          height: s(32),
          borderRadius: s(8),
          backgroundColor: colors.teal + "15",
          alignItems: "center",
          justifyContent: "center",
          marginRight: s(12),
        }}
      >
        {syncingKey === key ? (
          <ActivityIndicator size="small" color={spinnerColor} />
        ) : (
          icon
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: s(13), fontWeight: "600", color: colors.heading }}
        >
          {label}
        </Text>
        <Text style={{ fontSize: s(10), color: colors.muted, marginTop: s(1) }}>
          {subtitle}
        </Text>
      </View>
      {syncingKey !== key && <RefreshCw size={s(14)} color={colors.label} />}
    </TouchableOpacity>
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.screen,
        paddingHorizontal: s(14),
        paddingVertical: s(10),
      }}
    >
      {/* Header */}
      <View style={{ marginBottom: s(10) }}>
        <Text
          style={{ fontSize: s(15), fontWeight: "700", color: colors.heading }}
        >
          Syncing
        </Text>
        <Text style={{ fontSize: s(11), color: colors.label, marginTop: s(1) }}>
          Sync queue, failed operations, and manual POS sync.
        </Text>
      </View>

      <View
        style={{ height: 1, backgroundColor: colors.border, marginBottom: s(10) }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Sync Queue */}
        <View style={{ marginBottom: s(12) }}>
          <SyncQueuePanel />
        </View>

        {/* Failed Sync Operations */}
        <View style={{ marginBottom: s(12) }}>
          <FailedSyncsPanel />
        </View>

        {/* Manual sync */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: s(12),
            padding: s(12),
          }}
        >
          {renderSyncButton(
            "Sync POS",
            "Flush pending changes and re-fetch orders, menus, settings, and floor plan",
            <RefreshCw size={s(16)} color={colors.teal} />,
            "all",
            handleSyncAll,
          )}
          {renderSyncButton(
            "Check for Menu Changes",
            "Fetch the menu only if prices or items changed since the last sync",
            <UtensilsCrossed size={s(16)} color={colors.teal} />,
            "menu_version",
            handleCheckMenuChanges,
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default SyncingScreen;
