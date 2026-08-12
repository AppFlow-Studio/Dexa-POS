import { useTriggerPosSync } from "@/hooks/pos/usePosSync";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { CloudOff, Clock, RefreshCw } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

/**
 * Shown when MenuSection has no menu to display. Two very different causes hide
 * behind that one symptom, and conflating them is what turned a transient sync
 * failure into a support call:
 *
 * - `menus.length > 0` — the menu synced fine, nothing is scheduled right now.
 *   Genuinely a scheduling message; waiting or switching order type is right.
 * - `menus.length === 0` — the menu never loaded. Telling the operator to
 *   "check back later" is wrong and unactionable; they need to know the sync
 *   failed and be able to retry it from here.
 *
 * Kept as a leaf component so subscribing to `syncState` doesn't re-render the
 * whole menu grid every time the sync status changes.
 */
const MenuUnavailableState: React.FC = () => {
  const uiScale = useUiScale();
  const sc = (n: number) => Math.round(n * uiScale);

  const hasAnyMenu = useMenuStore((s) => s.menus.length > 0);
  const isSyncing = useMenuStore((s) => s.syncState.isLoading);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const triggerPosSync = useTriggerPosSync();
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = useCallback(async () => {
    if (!selectedStore?.id) return;
    setIsRetrying(true);
    try {
      await triggerPosSync(selectedStore.id, selectedStore.merchant_id);
    } finally {
      setIsRetrying(false);
    }
  }, [selectedStore?.id, selectedStore?.merchant_id, triggerPosSync]);

  const busy = isSyncing || isRetrying;

  const { icon, title, body } = hasAnyMenu
    ? {
        icon: <Clock size={sc(64)} color={colors.muted} />,
        title: "No Menu Available",
        body: "There are currently no menus scheduled for this time. Please check back later or select a different order type.",
      }
    : {
        icon: <CloudOff size={sc(64)} color={colors.muted} />,
        title: busy ? "Loading Menu…" : "Menu Not Loaded",
        body: busy
          ? "Fetching the latest menu from the server."
          : "The menu couldn't be downloaded — usually a network problem. It will keep retrying on its own; tap below to try again now.",
      };

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        marginTop: sc(80),
      }}
    >
      {busy && !hasAnyMenu ? (
        <ActivityIndicator size="large" color={colors.teal} />
      ) : (
        icon
      )}

      <Text
        style={{
          color: colors.heading,
          fontSize: sc(24),
          fontWeight: "bold",
          marginTop: sc(16),
        }}
      >
        {title}
      </Text>

      <Text
        style={{
          color: colors.muted,
          fontSize: sc(16),
          marginTop: sc(8),
          textAlign: "center",
          paddingHorizontal: sc(40),
        }}
      >
        {body}
      </Text>

      {!hasAnyMenu && (
        <TouchableOpacity
          onPress={handleRetry}
          disabled={busy || !selectedStore?.id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: sc(8),
            marginTop: sc(20),
            paddingHorizontal: sc(18),
            paddingVertical: sc(10),
            borderRadius: sc(10),
            backgroundColor: colors.teal,
            opacity: busy || !selectedStore?.id ? 0.5 : 1,
          }}
        >
          <RefreshCw size={sc(16)} color={colors.onSolid} />
          <Text
            style={{
              color: colors.onSolid,
              fontSize: sc(14),
              fontWeight: "700",
            }}
          >
            {busy ? "Syncing…" : "Retry Sync"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default MenuUnavailableState;
