import { formatScheduleSummary } from "@/lib/menu/menuSchedule";
import { colors } from "@/lib/theme";
import type { Schedule } from "@/lib/types";
import React from "react";
import { Text, View } from "react-native";

/**
 * Read-only schedule line for a menu or category.
 *
 * Schedules are authored in Dexa Admin only. The POS has no write path for
 * them, and the old in-app editor only changed local state that the next sync
 * overwrote — so this shows what is in force and where to change it, with no
 * edit affordance.
 */
export function ScheduleSummary({
  schedules,
  scale = (n: number) => n,
}: {
  schedules?: Schedule[] | null;
  /** The caller's UI scale function, so the text matches its surroundings. */
  scale?: (n: number) => number;
}) {
  const summary = formatScheduleSummary(schedules);

  return (
    <View style={{ gap: scale(4) }}>
      <Text
        style={{
          fontSize: scale(13),
          fontWeight: "600",
          color: summary ? colors.heading : colors.label,
        }}
      >
        {summary ? `Scheduled: ${summary}` : "No schedule — always available"}
      </Text>
      <Text style={{ fontSize: scale(12), color: colors.muted }}>
        {summary
          ? "Edit schedules in Dexa Admin"
          : "Assign schedules in Dexa Admin"}
      </Text>
    </View>
  );
}
