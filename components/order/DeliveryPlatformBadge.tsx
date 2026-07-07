import type { OnlineOrderProvider } from "@/lib/orderPlatformResolver";
import { resolveOrderPlatformLogo } from "@/lib/orderPlatformResolver";
import { colors } from "@/lib/theme";
import { Globe, ShoppingBag } from "lucide-react-native";
import { Image, ImageSourcePropType, Text, View } from "react-native";

const PLATFORM_LOGOS: Partial<Record<OnlineOrderProvider, ImageSourcePropType>> =
  {
    doordash: require("@/assets/images/doordash.png"),
    grubhub: require("@/assets/images/grubhub.png"),
    ubereats: require("@/assets/images/uber-eats.png"),
  };

const PLATFORM_COLORS: Partial<Record<OnlineOrderProvider, string>> = {
  doordash: "#FF3008",
  grubhub: "#F63440",
  ubereats: "#06C167",
};

interface DeliveryPlatformBadgeProps {
  deliveryPlatform?: string | null;
  metadataDeliveryCompany?: string | null;
  onlineOrderDeliveryCompany?: string | null;
  onlineOrderProvider?: string | null;
  orderSource?: string | null;
  size?: "sm" | "md" | "kds";
  uiScale?: number;
  solidBackground?: boolean;
}

export default function DeliveryPlatformBadge({
  deliveryPlatform,
  metadataDeliveryCompany,
  onlineOrderDeliveryCompany,
  onlineOrderProvider,
  orderSource,
  size = "sm",
  uiScale,
  solidBackground = false,
}: DeliveryPlatformBadgeProps) {
  const resolved = resolveOrderPlatformLogo({
    deliveryPlatform,
    metadataDeliveryCompany,
    onlineOrderDeliveryCompany,
    onlineOrderProvider,
    orderSource,
  });

  if (resolved.kind === "none") return null;

  const s =
    size === "kds" && uiScale != null
      ? (n: number) => Math.round(n * uiScale)
      : (n: number) => n;
  const logo = resolved.provider ? PLATFORM_LOGOS[resolved.provider] : undefined;
  const accent =
    (resolved.provider ? PLATFORM_COLORS[resolved.provider] : undefined) ??
    colors.teal;
  const logoSize = size === "md" ? 20 : 14;
  const containerSize = size === "md" ? 28 : 20;
  const fontSize = size === "kds" ? s(11) : size === "md" ? 11 : 10;

  if (resolved.kind === "marketplace" && logo) {
    if (size === "kds") {
      const badgeBg = solidBackground ? "#FFFFFF" : accent + "15";
      const badgeBorder = solidBackground ? accent : accent + "40";

      return (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(4),
            backgroundColor: badgeBg,
            borderWidth: 1,
            borderColor: badgeBorder,
            borderRadius: s(20),
            paddingHorizontal: s(8),
            paddingVertical: s(3),
          }}
        >
          <Image
            source={logo}
            style={{ width: s(16), height: s(16) }}
            resizeMode="contain"
          />
          <Text style={{ fontSize: s(11), fontWeight: "700", color: accent }}>
            {resolved.label}
          </Text>
        </View>
      );
    }

    return (
      <View
        style={{
          width: containerSize,
          height: containerSize,
          borderRadius: containerSize / 2,
          backgroundColor: accent + "22",
          borderWidth: 1,
          borderColor: accent + "55",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Image
          source={logo}
          style={{ width: logoSize, height: logoSize }}
          resizeMode="contain"
        />
      </View>
    );
  }

  const FallbackIcon = resolved.kind === "first_party" ? ShoppingBag : Globe;
  const badgeBg = solidBackground ? "#FFFFFF" : colors.teal + "20";
  const badgeBorder = solidBackground ? colors.teal : colors.teal + "50";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(3),
        backgroundColor: badgeBg,
        borderWidth: 1,
        borderColor: badgeBorder,
        borderRadius: s(20),
        paddingHorizontal: size === "kds" ? s(8) : size === "md" ? 8 : 6,
        paddingVertical: size === "kds" ? s(3) : size === "md" ? 3 : 2,
      }}
    >
      <FallbackIcon
        size={size === "kds" ? s(12) : size === "md" ? 12 : 9}
        color={colors.teal}
      />
      <Text style={{ fontSize, fontWeight: "700", color: colors.teal }}>
        {resolved.label}
      </Text>
    </View>
  );
}
