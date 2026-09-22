import { colors } from "@/lib/theme";
import React from "react";
import { Text, View } from "react-native";
import { metrics, tint } from "../../lib/tokens";
import { type } from "../../lib/type";

/**
 * The artifact's `.msg` block on screen 8: a 112dp `.orb` with a ring drawn
 * 14dp outside it, a 24/600 line and a muted paragraph, all centred.
 *
 * `tone` swaps the orb to the warning wash (`.orb.warn`), which the artifact
 * uses for the states that need the operator rather than the guest.
 */
export function ChargeMessage({
  icon,
  title,
  detail,
  tone = "accent",
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  tone?: "accent" | "warn";
}) {
  const bg = tone === "warn" ? tint.warnSoft : tint.accentSoft;
  const ring = tone === "warn" ? "rgba(251,191,36,0.18)" : "rgba(173,198,255,0.16)";

  return (
    <View className="flex-1 items-center justify-center" style={{ paddingHorizontal: 30 }}>
      <View style={{ marginBottom: 34 }}>
        {/* The ring is a second view rather than a border on the orb: a
            border would eat into the 112dp the icon is centred in. */}
        <View
          className="absolute"
          style={{
            top: -metrics.orbRing,
            left: -metrics.orbRing,
            right: -metrics.orbRing,
            bottom: -metrics.orbRing,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: ring,
          }}
        />
        <View
          className="items-center justify-center"
          style={{
            width: metrics.orb,
            height: metrics.orb,
            borderRadius: 999,
            backgroundColor: bg,
          }}
        >
          {icon}
        </View>
      </View>
      <Text className="text-center" style={[type.message, { color: colors.heading }]}>
        {title}
      </Text>
      <Text className="mt-3 text-center" style={[type.messageDesc, { color: colors.label }]}>
        {detail}
      </Text>
    </View>
  );
}
