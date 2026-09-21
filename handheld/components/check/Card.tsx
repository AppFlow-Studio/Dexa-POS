import { colors } from "@/lib/theme";
import { Check } from "lucide-react-native";
import React from "react";
import { Text, View } from "react-native";
import { tint } from "../../lib/tokens";
import { type } from "../../lib/type";

/** The artifact's `.card`: 22dp radius on the panel colour, 16dp margins. */
export function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="mx-4 mb-3 overflow-hidden rounded-[22px]"
      style={{ backgroundColor: colors.panel }}
    >
      {children}
    </View>
  );
}

/** `.chipx.warn`: "Not sent" / "Queued" pill. */
export function WarnChip({ label }: { label: string }) {
  return (
    <View
      className="flex-row items-center gap-1.5 rounded-full px-3"
      style={{ minHeight: 30, backgroundColor: tint.warnSoft }}
    >
      <Text style={[type.chip, { color: colors.warning }]}>{label}</Text>
    </View>
  );
}

/** `.okd`: the green check disc on a sent course. */
export function SentDisc() {
  return (
    <View
      className="h-9 w-9 items-center justify-center rounded-full"
      style={{ backgroundColor: tint.okSoft }}
    >
      <Check size={20} color={colors.success} strokeWidth={2.4} />
    </View>
  );
}

/** `.card-h`: title + detail on the left, a value or chip on the right. */
export function CardHeader({
  title,
  detail,
  value,
  leading,
  trailing,
}: {
  title: string;
  detail?: string;
  value?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3.5">
      {leading}
      <View className="min-w-0 flex-1">
        <Text style={[type.cardTitle, { color: colors.heading }]} numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text className="mt-0.5" style={[type.detail, { color: colors.label }]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing ??
        (value ? (
          <Text style={[type.value, { color: colors.label }]}>{value}</Text>
        ) : null)}
    </View>
  );
}
