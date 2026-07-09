/**
 * DeliveryPlatformBadge
 *
 * Renders a small logo badge for delivery platform orders.
 * Uses bundled static assets — no remote fetches.
 *
 * Accepts the backend `delivery_platform` string (e.g. "uber_eats", "doordash")
 * or falls back to `order_source` for generic "Online" display.
 *
 * Returns null for POS orders or when no platform info is present.
 */

import { colors } from "@/lib/theme";
import { Globe } from "lucide-react-native";
import { Image, ImageSourcePropType, Text, View } from "react-native";

// ── Logo asset map (backend platform name → bundled asset) ──────────────────

const PLATFORM_LOGOS: Record<string, ImageSourcePropType> = {
  // DoorDash
  doordash: require("@/assets/images/doordash.png"),
  door_dash: require("@/assets/images/doordash.png"),
  // Grubhub
  grubhub: require("@/assets/images/grubhub.png"),
  // Uber Eats
  uber_eats: require("@/assets/images/uber-eats.png"),
  ubereats: require("@/assets/images/uber-eats.png"),
  "uber-eats": require("@/assets/images/uber-eats.png"),
  // Food Panda / Postmates (reuse food-panda asset as placeholder)
  food_panda: require("@/assets/images/food-panda.png"),
  foodpanda: require("@/assets/images/food-panda.png"),
  postmates: require("@/assets/images/food-panda.png"),
};

// Brand accent colors (background tint for the logo container)
const PLATFORM_COLORS: Record<string, string> = {
  doordash: "#FF3008",
  door_dash: "#FF3008",
  grubhub: "#F63440",
  uber_eats: "#06C167",
  ubereats: "#06C167",
  "uber-eats": "#06C167",
  food_panda: "#D70F64",
  foodpanda: "#D70F64",
  postmates: "#6E48AA",
};

// Human-readable display names for KDS badges
const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  doordash: "DoorDash",
  door_dash: "DoorDash",
  grubhub: "Grubhub",
  uber_eats: "Uber Eats",
  ubereats: "Uber Eats",
  "uber-eats": "Uber Eats",
  food_panda: "Food Panda",
  foodpanda: "Food Panda",
  postmates: "Postmates",
};

// ── Props ────────────────────────────────────────────────────────────────────

interface DeliveryPlatformBadgeProps {
  /** Backend delivery_platform field value (e.g. "uber_eats") */
  deliveryPlatform?: string | null;
  /** Backend order_source field (fallback for generic online badge) */
  orderSource?: string | null;
  /** Badge size variant — 'sm' fits inside order chips row, 'md' for detail views, 'kds' for KDS ticket headers */
  size?: "sm" | "md" | "kds";
  /**
   * UI scale factor for KDS ticket headers (passed from useUiScale()).
   * When provided, all spacing/font sizes are scaled proportionally.
   * Only applies when size="kds".
   */
  uiScale?: number;
  /**
   * When true, use opaque solid backgrounds instead of semi-transparent tints.
   * Set this when the badge sits on a colored header (e.g. urgency background)
   * to prevent color blending.
   */
  solidBackground?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DeliveryPlatformBadge({
  deliveryPlatform,
  orderSource,
  size = "sm",
  uiScale,
  solidBackground = false,
}: DeliveryPlatformBadgeProps) {
  const normalizedSource = orderSource?.toLowerCase().trim() ?? "";
  const isPosLikeSource =
    normalizedSource === "" ||
    normalizedSource === "pos" ||
    normalizedSource === "in_store" ||
    normalizedSource === "in-store";

  // Scale helper — only used in kds mode
  const s =
    uiScale != null ? (n: number) => Math.round(n * uiScale) : (n: number) => n;

  // POS orders → show nothing
  if (!deliveryPlatform && isPosLikeSource) {
    return null;
  }

  // Some flows provide platform info only in order_source. Use it as a platform fallback.
  const key = (deliveryPlatform?.toLowerCase() ?? normalizedSource).trim();
  const logo = PLATFORM_LOGOS[key];
  const accent = PLATFORM_COLORS[key] ?? colors.teal;

  const logoSize = size === "md" ? 20 : 14;
  const containerSize = size === "md" ? 28 : 20;
  const fontSize = size === "kds" ? s(11) : size === "md" ? 11 : 10;

  // Known platform with logo
  if (logo) {
    // KDS: pill badge with icon + platform name
    if (size === "kds") {
      const displayName = PLATFORM_DISPLAY_NAMES[key] ?? key;
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
            {displayName}
          </Text>
        </View>
      );
    }

    // sm / md: circular icon only
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

  // Unknown external platform — generic globe badge
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
      <Globe
        size={size === "kds" ? s(12) : size === "md" ? 12 : 9}
        color={colors.teal}
      />
      <Text style={{ fontSize, fontWeight: "700", color: colors.teal }}>
        Online
      </Text>
    </View>
  );
}
