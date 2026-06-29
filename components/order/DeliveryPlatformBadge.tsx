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
}

export default function DeliveryPlatformBadge({
  deliveryPlatform,
  metadataDeliveryCompany,
  onlineOrderDeliveryCompany,
  onlineOrderProvider,
  orderSource,
  size = "sm",
}: DeliveryPlatformBadgeProps) {
  const resolved = resolveOrderPlatformLogo({
    deliveryPlatform,
    metadataDeliveryCompany,
    onlineOrderDeliveryCompany,
    onlineOrderProvider,
    orderSource,
  });

  if (resolved.kind === "none") return null;

  const logo = resolved.provider ? PLATFORM_LOGOS[resolved.provider] : undefined;
  const accent =
    (resolved.provider ? PLATFORM_COLORS[resolved.provider] : undefined) ??
    colors.teal;
  const logoSize = size === "md" ? 20 : 14;
  const containerSize = size === "md" ? 28 : 20;
  const fontSize = size === "kds" ? 11 : size === "md" ? 11 : 10;

  if (resolved.kind === "marketplace" && logo) {
    if (size === "kds") {
      return (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: accent + "15",
            borderWidth: 1,
            borderColor: accent + "40",
            borderRadius: 20,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Image
            source={logo}
            style={{ width: 16, height: 16 }}
            resizeMode="contain"
          />
          <Text style={{ fontSize: 11, fontWeight: "700", color: accent }}>
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

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        backgroundColor: colors.teal + "20",
        borderWidth: 1,
        borderColor: colors.teal + "50",
        borderRadius: 20,
        paddingHorizontal: size === "kds" ? 8 : size === "md" ? 8 : 6,
        paddingVertical: size === "kds" ? 3 : size === "md" ? 3 : 2,
      }}
    >
      <FallbackIcon
        size={size === "kds" ? 12 : size === "md" ? 12 : 9}
        color={colors.teal}
      />
      <Text style={{ fontSize, fontWeight: "700", color: colors.teal }}>
        {resolved.label}
      </Text>
    </View>
  );
}
