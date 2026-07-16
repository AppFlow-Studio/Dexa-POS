import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskOrderType } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { Image } from "expo-image";
import { ShoppingBag, UtensilsCrossed, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

/**
 * Shared kiosk header.
 *
 *   left   — logo (or profile name), vertically centered
 *   center — segmented Dine In / Takeaway switch (toggles orderType inline)
 *   right  — a clear "Cancel" button (outlined pill with an X)
 *
 * The cart lives in a floating button (see KioskCartButton), not the header.
 * Theme-driven from `config`; sits on `config.primaryColor` with white
 * foreground. Reusable by any template that wants a top bar.
 */
const SEGMENTS: {
  type: KioskOrderType;
  label: string;
  Icon: typeof UtensilsCrossed;
}[] = [
  { type: "dine_in", label: "Dine In", Icon: UtensilsCrossed },
  { type: "takeout", label: "Takeaway", Icon: ShoppingBag },
];

export function KioskHeader({
  config,
  orderType,
  onChangeOrderType,
  onExit,
}: {
  config: KioskConfig;
  orderType: KioskOrderType | null;
  onChangeOrderType: (type: KioskOrderType) => void;
  onExit: () => void;
}) {
  const s = useKioskUiScale();
  return (
    <View
      style={{
        height: kioskPx(88, s),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: kioskPx(24, s),
        backgroundColor: config.primaryColor,
      }}
    >
      {/* Left — logo / name, left-aligned & vertically centered */}
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
        }}
      >
        {config.logoUrl ? (
          <Image
            source={{ uri: config.logoUrl }}
            style={{ height: kioskPx(48, s), width: kioskPx(140, s) }}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        ) : (
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: kioskPx(22, s),
              fontWeight: "700",
            }}
          >
            {config.profileName}
          </Text>
        )}
      </View>

      {/* Center — segmented order-type switch */}
      <View
        style={{
          flexDirection: "row",
          backgroundColor: "rgba(255,255,255,0.18)",
          borderRadius: 999,
          padding: kioskPx(4, s),
        }}
      >
        {SEGMENTS.map(({ type, label, Icon }) => {
          const active = orderType === type;
          return (
            <Pressable
              key={type}
              onPress={() => onChangeOrderType(type)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: kioskPx(8, s),
                paddingHorizontal: kioskPx(22, s),
                paddingVertical: kioskPx(11, s),
                borderRadius: 999,
                backgroundColor: active ? "#FFFFFF" : "transparent",
              }}
            >
              <Icon
                size={kioskPx(18, s)}
                color={active ? config.primaryColor : "rgba(255,255,255,0.9)"}
              />
              <Text
                style={{
                  fontSize: kioskPx(15, s),
                  fontWeight: active ? "700" : "500",
                  color: active ? config.primaryColor : "rgba(255,255,255,0.9)",
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Right — clear Cancel button */}
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={onExit}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: kioskPx(8, s),
            paddingHorizontal: kioskPx(18, s),
            paddingVertical: kioskPx(10, s),
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.14)",
            borderWidth: 1.5,
            borderColor: "rgba(255,255,255,0.6)",
          }}
        >
          <X size={kioskPx(18, s)} color="#FFFFFF" />
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: kioskPx(15, s),
              fontWeight: "600",
            }}
          >
            Cancel
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
