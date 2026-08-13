import { useTriggerPosSync } from "@/hooks/pos/usePosSync";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { RefreshCw } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

/**
 * Slim strip above the menu grid, shown when the items on screen are NOT known
 * to be current:
 *
 * - `isFromCache` — restored from the offline snapshot because the live sync
 *   hadn't landed. The grid looks completely normal, so without this the
 *   operator has no way to know they might be ringing up yesterday's prices.
 * - `isError` — the last live sync attempt failed. The menu may be fine (an
 *   earlier sync succeeded this session) but it is no longer being kept fresh.
 *
 * The retry loop in PosSyncProvider is already working the problem in the
 * background; this exists so staff can force it from where they noticed the
 * problem instead of hunting for Settings → Syncing.
 */
const MenuStaleBanner: React.FC = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const isFromCache = useMenuStore((st) => st.syncState.isFromCache);
  const isError = useMenuStore((st) => st.syncState.isError);
  const isSyncing = useMenuStore((st) => st.syncState.isLoading);
  const lastSyncedAt = useMenuStore((st) => st.syncState.lastSyncedAt);
  const hasAnyMenu = useMenuStore((st) => st.menus.length > 0);
  const selectedStore = useStoreSettingsStore((st) => st.selectedStore);
  const triggerPosSync = useTriggerPosSync();
  const [isRetrying, setIsRetrying] = useState(false);

  const handleSync = useCallback(async () => {
    if (!selectedStore?.id) return;
    setIsRetrying(true);
    try {
      await triggerPosSync(selectedStore.id, selectedStore.merchant_id);
    } finally {
      setIsRetrying(false);
    }
  }, [selectedStore?.id, selectedStore?.merchant_id, triggerPosSync]);

  // Nothing on screen to be stale about — MenuUnavailableState owns that case
  // and already offers a retry, so a banner here would just be a second one.
  if (!hasAnyMenu) return null;
  if (!isFromCache && !isError) return null;

  const busy = isSyncing || isRetrying;

  return (
    <TouchableOpacity
      onPress={handleSync}
      disabled={busy || !selectedStore?.id}
      activeOpacity={0.8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(8),
        paddingHorizontal: s(10),
        paddingVertical: s(7),
        marginBottom: s(8),
        borderRadius: s(10),
        borderWidth: 1,
        borderColor: colors.warning + "45",
        backgroundColor: colors.warning + "15",
      }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.warning} />
      ) : (
        <RefreshCw size={s(14)} color={colors.warning} />
      )}

      <View style={{ flex: 1 }}>
        <Text
          style={{ color: colors.warning, fontSize: s(12), fontWeight: "700" }}
        >
          {busy ? "Syncing menu…" : "Menu may be out of date"}
        </Text>
        <Text style={{ color: colors.muted, fontSize: s(10), marginTop: s(1) }}>
          {busy
            ? "Fetching the latest prices and availability."
            : `Showing the last synced menu${formatSyncedAt(lastSyncedAt)}. Tap to sync now.`}
        </Text>
      </View>

      {!busy && (
        <View
          style={{
            paddingHorizontal: s(10),
            paddingVertical: s(5),
            borderRadius: s(8),
            backgroundColor: colors.warning,
          }}
        >
          <Text
            style={{
              color: colors.onSolid,
              fontSize: s(11),
              fontWeight: "700",
            }}
          >
            Sync
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

/** " from 2:45 PM" / " from Aug 11" — empty string when the stamp is unusable. */
function formatSyncedAt(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const sameDay = new Date().toDateString() === date.toDateString();
  return sameDay
    ? ` from ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : ` from ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export default MenuStaleBanner;
