import { colors } from "@/lib/theme";
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

/**
 * Full-width strip at the top of a KDS ticket card: "Updating…" while a bump
 * RPC is pending, "Update failed — tap to retry" once it has given up.
 * Renders nothing in the normal case so the card layout is untouched.
 */
export function BumpRetryBadge({
  failed,
  inFlight,
  onRetry,
  scale: s,
}: BumpRetryBadgeProps) {
  if (!failed && !inFlight) return null;

  if (inFlight) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s(6),
          paddingHorizontal: s(12),
          paddingVertical: s(4),
          backgroundColor: "#F3F4F6",
        }}
      >
        <ActivityIndicator size="small" color={colors.label} />
        <Text style={{ fontSize: s(11), color: colors.label }}>Updating…</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel="Update failed, tap to retry"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: s(6),
        paddingHorizontal: s(12),
        paddingVertical: s(6),
        backgroundColor: pressed ? "#FECACA" : "#FEE2E2",
      })}
    >
      <AlertTriangle size={s(14)} color={colors.danger} />
      <Text
        style={{
          flex: 1,
          fontSize: s(12),
          fontWeight: "600",
          color: colors.danger,
        }}
      >
        Update failed — tap to retry
      </Text>
      <RefreshCw size={s(14)} color={colors.danger} />
    </Pressable>
  );
}
