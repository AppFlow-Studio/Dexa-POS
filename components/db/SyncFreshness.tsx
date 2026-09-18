import { RefreshCw } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

import {
  formatAbsoluteTime,
  formatRelativeAge,
  useLocalFreshness,
} from "@/hooks/db/useLocalFreshness";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";

/**
 * The one freshness stamp, shared by every screen that reads local data.
 *
 * Placement: header-right on list screens, under the title on dashboards.
 * Never a modal, never blocking. The data is already on screen — this explains
 * it, it does not gate it.
 *
 * Presentation follows the state, and the `live` case showing NOTHING is the
 * important one: a badge that is always visible stops being read. It earns
 * attention by appearing only when something is actually off.
 */
interface Props {
  entity: string;
  locationId: string | null;
  /** Force a revalidation. Without it the stale strip is informational only. */
  onSync?: () => Promise<void> | void;
  /** Dashboards want the stamp under a title; lists want it inline. */
  align?: "left" | "right";
}

export const SyncFreshness: React.FC<Props> = ({
  entity,
  locationId,
  onSync,
  align = "right",
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const { state, lastSuccessAt, isRevalidating, refresh } = useLocalFreshness(
    entity,
    locationId,
  );
  const [isSyncing, setIsSyncing] = useState(false);

  const handlePress = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await onSync?.();
      await refresh();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, onSync, refresh]);

  // Current and online: say nothing. Don't nag when it's right.
  if (state === "live") return null;

  // "never" is MenuUnavailableState's job — an empty screen needs a real empty
  // state with a retry, not a one-line stamp explaining why it's empty.
  if (state === "never") return null;

  const busy = isRevalidating || isSyncing;
  const isWarning = state === "stale" || state === "offline";

  const label =
    state === "offline"
      ? `Offline — showing data from ${formatAbsoluteTime(lastSuccessAt)}`
      : `Last synced ${formatRelativeAge(lastSuccessAt)}`;

  // Quiet muted line — informational, not interactive.
  if (!isWarning) {
    return (
      <Text
        style={{
          fontSize: s(11),
          color: colors.muted,
          textAlign: align === "right" ? "right" : "left",
        }}
      >
        {label}
      </Text>
    );
  }

  // Amber strip — the MenuStaleBanner treatment, tap to sync.
  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={busy || !onSync}
      activeOpacity={0.8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(8),
        paddingHorizontal: s(10),
        paddingVertical: s(7),
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
        <Text style={{ fontSize: s(12), color: colors.warning }}>
          {label}
          {onSync ? " · Tap to sync" : ""}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default SyncFreshness;
