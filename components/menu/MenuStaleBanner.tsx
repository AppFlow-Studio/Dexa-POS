import {
  formatAbsoluteTime,
  formatRelativeAge,
  useLocalFreshness,
} from "@/hooks/db/useLocalFreshness";
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
 *
 * ---------------------------------------------------------------------------
 * Phase 4: where the timestamp comes from, and why not the freshness STATE
 * ---------------------------------------------------------------------------
 * The stamp is read from the local mirror's `sync_state` row
 * (`useLocalFreshness("menu")`), which records the last moment a live sync
 * actually CONFIRMED this menu — including the version-unchanged path, where
 * nothing was rewritten but the server still told us the menu on screen is
 * current. That is a durable, cross-launch fact; `syncState.lastSyncedAt` is
 * an in-memory copy of whatever payload happened to hydrate the store, and on
 * a cache boot it is the snapshot's own age.
 *
 * What is deliberately NOT used is the freshness STATE as the trigger. The
 * menu's `staleAfterMs` is a tight 2 minutes (a stale menu rings up yesterday's
 * prices) but `usePosSync` is `staleTime: Infinity` and does not poll, so
 * "stale" would be true on every station within two minutes of boot. A banner
 * that is always up is a banner nobody reads, and it would bury the two cases
 * that genuinely mean something. The trigger stays `isFromCache || isError`;
 * freshness supplies the wording and the honest "and you are offline, so it
 * cannot fix itself" case.
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
  const freshness = useLocalFreshness("menu", selectedStore?.id ?? null);
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
  const isOffline = freshness.state === "offline";

  // The mirror's stamp is the durable one — it survives a relaunch and records
  // the last live CONFIRMATION, not the age of whatever payload hydrated the
  // store. Fall back to the in-memory stamp on a device where the local DB
  // never opened, or before the mirror's first write.
  const confirmedAt = freshness.lastSuccessAt ?? lastSyncedAt;

  const detail = busy
    ? "Fetching the latest prices and availability."
    : isOffline
      ? // Absolute time, not "3 minutes ago": offline is the case where the
        // operator wants to know WHEN, because it is not about to change.
        `No connection. Last confirmed${confirmedAt ? ` at ${formatAbsoluteTime(confirmedAt)}` : ""}; prices and 86s may have changed since.`
      : `Last confirmed ${formatRelativeAge(confirmedAt)}. Tap to sync now.`;

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
          {detail}
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

export default MenuStaleBanner;
