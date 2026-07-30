import { colors } from "@/lib/theme";
import type { ProviderKey } from "@/lib/previousOrdersFilters";
import { Home, Globe } from "lucide-react-native";
import React from "react";
import { Image, ImageSourcePropType, View } from "react-native";

const PROVIDER_LOGOS: Partial<Record<ProviderKey, ImageSourcePropType>> = {
  doordash: require("@/assets/images/doordash.png"),
  grubhub: require("@/assets/images/grubhub.png"),
  ubereats: require("@/assets/images/uber-eats.png"),
};

export const PROVIDER_ACCENTS: Record<ProviderKey, string> = {
  doordash: "#FF3008",
  grubhub: "#F63440",
  ubereats: "#06C167",
  get house() {
    return colors.teal;
  },
  get other() {
    return colors.label;
  },
} as Record<ProviderKey, string>;

/**
 * Square provider mark used in the chip row and on order rows: brand logo for
 * marketplaces, a tinted icon for the merchant's own channels.
 */
export default function ProviderGlyph({
  provider,
  size,
}: {
  provider: ProviderKey;
  size: number;
}) {
  const logo = PROVIDER_LOGOS[provider];
  const accent = PROVIDER_ACCENTS[provider];

  if (logo) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size / 3),
          backgroundColor: accent,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Image
          source={logo}
          style={{ width: Math.round(size * 0.72), height: Math.round(size * 0.72) }}
          resizeMode="contain"
        />
      </View>
    );
  }

  const Icon = provider === "house" ? Home : Globe;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 3),
        backgroundColor: accent + "22",
        borderWidth: 1,
        borderColor: accent + "55",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={Math.round(size * 0.62)} color={accent} />
    </View>
  );
}
