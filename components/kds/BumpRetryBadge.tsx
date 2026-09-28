import { AlertTriangle, RefreshCw } from "@/lib/icons";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

interface BumpRetryBadgeProps {
  /** A bump for this ticket exhausted its retry; tapping re-issues it. */
  failed: boolean;
  /** A bump RPC for this ticket is in flight; taps on the card are dropped. */
  inFlight: boolean;
  onRetry: () => void;
  /** The card's UI scale helper, so the strip matches its neighbours. */
  scale: (n: number) => number;
}

// The card body is always white, so these are fixed rather than themed:
// the dark theme's `danger`/`label` tokens are too pale to read on it.
const FAILED_BG = "#FEE2E2";
const FAILED_BORDER = "#FECACA";
const FAILED_TEXT = "#991B1B";
const FAILED_ICON = "#B91C1C";
const RETRY_BG = "#DC2626";
const PENDING_BG = "#F3F4F6";
const PENDING_BORDER = "#E5E7EB";
const PENDING_TEXT = "#4B5563";

/**
 * Full-width strip at the top of a KDS ticket card: "Updating…" while a bump
 * RPC is pending, "Update failed" with a Retry pill once it has given up.
 * Both states share one height so the card doesn't jump between them.
 * Renders nothing in the normal case so the card layout is untouched.
 */
export function BumpRetryBadge({
  failed,
  inFlight,
  onRetry,
  scale: s,
}: BumpRetryBadgeProps) {
  if (!failed && !inFlight) return null;

  const strip = {
    flexDirection: "row",
    alignItems: "center",
    gap: s(8),
    minHeight: s(40),
    paddingLeft: s(12),
    paddingRight: s(8),
    borderBottomWidth: 1,
  } as const;

  if (inFlight) {
    return (
      <View
        style={{
          ...strip,
          backgroundColor: PENDING_BG,
          borderBottomColor: PENDING_BORDER,
        }}
      >
        <ActivityIndicator size="small" color={PENDING_TEXT} />
        <Text
          style={{ fontSize: s(13), fontWeight: "600", color: PENDING_TEXT }}
          numberOfLines={1}
        >
          Updating…
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel="Update failed. Retry"
      android_ripple={{ color: FAILED_BORDER, borderless: false }}
      // A plain style object: a `({ pressed }) => style` function is dropped
      // here (the strip rendered unstyled, icons stacked on their own lines),
      // and the native ripple is the press feedback anyway.
      style={{
        ...strip,
        backgroundColor: FAILED_BG,
        borderBottomColor: FAILED_BORDER,
      }}
    >
      <AlertTriangle size={s(16)} color={FAILED_ICON} />
      <Text
        style={{
          flex: 1,
          fontSize: s(13),
          fontWeight: "700",
          color: FAILED_TEXT,
        }}
        numberOfLines={1}
      >
        Update failed
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s(5),
          height: s(28),
          paddingHorizontal: s(12),
          borderRadius: s(14),
          backgroundColor: RETRY_BG,
        }}
      >
        <RefreshCw size={s(13)} color="#FFFFFF" />
        <Text style={{ fontSize: s(12), fontWeight: "700", color: "#FFFFFF" }}>
          Retry
        </Text>
      </View>
    </Pressable>
  );
}
