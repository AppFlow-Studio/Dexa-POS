import React, { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import {
  syncProgressPercent,
  useLocalDbSyncStore,
} from "@/stores/useLocalDbSyncStore";

const BAR_WIDTH = 220;

/**
 * "Syncing order history — 42%" — the cold-sync strip.
 *
 * Shown ONLY while the local mirror is being built for the first time, which
 * is the one moment a local-first screen genuinely holds less than the server
 * and the operator would otherwise be looking at a short list with no
 * explanation. Every later cycle is one near-empty round trip and needs no UI.
 *
 * Three rules this encodes, all of them about not lying:
 *
 *  1. **No denominator, no percentage.** When the descriptor could not count
 *     (offline mid-count, an RPC error, an entity with no `countPending`), this
 *     falls back to an indeterminate sweep and a row count — never "0%", which
 *     reads as "stuck".
 *  2. **The bar never goes backwards.** The percentage is rows received against
 *     a count taken once at the start, and `syncEntity` clamps the denominator
 *     up if the walk overtakes it — so the bar can stall but cannot reverse.
 *  3. **It is not a gate.** The list underneath renders whatever the mirror
 *     already holds. This explains the gap; it never blocks reading.
 *
 * No spinner, determinate or not: this screen's loading language is a bar
 * (see `LoadingBar` in previous-orders.tsx — "no spinning circle anywhere in
 * the loading UX"), and a progress strip is the last place to break it.
 *
 * One component because it appears on both Previous Orders and the order-entry
 * section, and two copies of a progress rule drift.
 */
interface Props {
  /** The section variant is tighter — it sits inside a narrower column. */
  compact?: boolean;
  label?: string;
}

export const SyncProgressBanner: React.FC<Props> = ({
  compact = false,
  label = "Syncing order history for the first time",
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const progress = useLocalDbSyncStore((st) => st.progress);
  const percent = syncProgressPercent(progress);

  const fontSize = compact ? s(11) : s(12);

  return (
    <View
      style={{
        marginBottom: compact ? s(6) : s(10),
        paddingHorizontal: compact ? s(10) : s(12),
        paddingVertical: compact ? s(6) : s(8),
        borderRadius: compact ? s(6) : s(8),
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.teal,
      }}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}
      >
        <Text
          style={{ fontSize, color: colors.teal, flex: 1, fontWeight: "600" }}
        >
          {label}
          {percent !== null ? ` — ${percent}%` : "…"}
        </Text>

        {/* The raw counts: "42%" of an unknown quantity tells an operator
            waiting on a slow connection nothing actionable. */}
        {progress ? (
          <Text
            style={{ fontSize: fontSize - 1, color: colors.muted }}
            numberOfLines={1}
          >
            {progress.total !== null
              ? `${formatCount(progress.received)} / ${formatCount(progress.total)}`
              : formatCount(progress.received)}
          </Text>
        ) : null}
      </View>

      <View
        style={{
          height: s(4),
          marginTop: compact ? s(5) : s(7),
          borderRadius: s(2),
          overflow: "hidden",
          backgroundColor: colors.border,
        }}
      >
        {percent !== null ? (
          <View
            style={{
              width: `${percent}%`,
              height: "100%",
              borderRadius: s(2),
              backgroundColor: colors.teal,
            }}
          />
        ) : (
          <IndeterminateSweep />
        )}
      </View>
    </View>
  );
};

/**
 * The no-denominator fallback: something is happening, we cannot say how much
 * is left. Same sweep as the list's `LoadingBar`, so the two read as one
 * loading language rather than two.
 */
const IndeterminateSweep: React.FC = () => {
  const translateX = useSharedValue(-BAR_WIDTH);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(BAR_WIDTH, {
        duration: 900,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      false,
    );
    return () => cancelAnimation(translateX);
  }, [translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: BAR_WIDTH * 0.4,
          height: "100%",
          borderRadius: 2,
          backgroundColor: colors.teal,
        },
        animatedStyle,
      ]}
    />
  );
};

/** 1,234 — thousands separated, because these run to five figures. */
function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export default SyncProgressBanner;
