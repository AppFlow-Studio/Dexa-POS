import {
  formatAbsoluteTime,
  formatRelativeAge,
  useLocalFreshness,
} from "@/hooks/db/useLocalFreshness";
import { useInventoryWriteGate } from "@/hooks/inventory/useInventoryWriteGate";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { RefreshCw } from "lucide-react-native";
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

interface Props {
  /** True while the live sync is in flight. */
  isSyncing: boolean;
  /** True when the catalog on screen came from the mirror, not the network. */
  isFromMirror: boolean;
  /** True when the last live sync attempt failed. */
  isError: boolean;
  onRetry: () => void;
}

/**
 * Slim strip above the inventory tabs, shown when the catalog on screen is NOT
 * known to be current.
 *
 * ---------------------------------------------------------------------------
 * Why the trigger is not the freshness STATE
 * ---------------------------------------------------------------------------
 * Inventory's `staleAfterMs` is a tight 60 seconds, because stock is the most
 * time-sensitive thing the app mirrors. Wiring that directly to the banner
 * would put it up on every station a minute after entering the section,
 * permanently — and a banner that is always up is one nobody reads. This is the
 * same trap Phase 4 hit with the menu.
 *
 * So the trigger is the two states that genuinely mean "this may not be
 * current" — rendered from the mirror, or the last sync failed — and freshness
 * supplies the STAMP: the last moment a live sync actually confirmed this
 * catalog, which survives a relaunch because it lives in `sync_state`.
 *
 * ---------------------------------------------------------------------------
 * The second line, which the menu banner does not have
 * ---------------------------------------------------------------------------
 * Inventory is the first mirrored section with WRITES on it, and offline those
 * are refused (see useInventoryStore's write gate). An operator who can read
 * the catalog offline will reasonably assume they can also count a shelf, so
 * the banner says outright that they cannot — before they try, not after.
 */
const InventoryStaleBanner: React.FC<Props> = ({
  isSyncing,
  isFromMirror,
  isError,
  onRetry,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const selectedStore = useStoreSettingsStore((st) => st.selectedStore);
  const freshness = useLocalFreshness("inventory", selectedStore?.id ?? null);
  const { canWrite } = useInventoryWriteGate();

  if (!isFromMirror && !isError) return null;

  const isOffline = freshness.state === "offline" || !canWrite;
  const confirmedAt = freshness.lastSuccessAt;

  const detail = isSyncing
    ? "Fetching the latest stock levels."
    : isOffline
      ? // Absolute time, not "3 minutes ago": offline is the case where the
        // operator wants to know WHEN, because it is not about to change.
        `No connection. Stock last confirmed${confirmedAt ? ` at ${formatAbsoluteTime(confirmedAt)}` : ""}.`
      : `Stock last confirmed ${formatRelativeAge(confirmedAt)}. Tap to sync now.`;

  return (
    <TouchableOpacity
      onPress={onRetry}
      disabled={isSyncing}
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
      {isSyncing ? (
        <ActivityIndicator size="small" color={colors.warning} />
      ) : (
        <RefreshCw size={s(14)} color={colors.warning} />
      )}

      <View style={{ flex: 1 }}>
        <Text
          style={{ color: colors.warning, fontSize: s(12), fontWeight: "700" }}
        >
          {isSyncing ? "Syncing inventory…" : "Stock levels may be out of date"}
        </Text>
        <Text style={{ color: colors.muted, fontSize: s(10), marginTop: s(1) }}>
          {detail}
        </Text>
        {!canWrite && (
          <Text
            style={{ color: colors.muted, fontSize: s(10), marginTop: s(1) }}
          >
            Changes to stock, vendors and purchase orders are unavailable until
            you reconnect.
          </Text>
        )}
      </View>

      {!isSyncing && (
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

export default InventoryStaleBanner;
