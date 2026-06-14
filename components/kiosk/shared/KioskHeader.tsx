import type { KioskOrderType } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { ShoppingBag, UtensilsCrossed, X } from "lucide-react-native";
import { Image, Pressable, Text, View } from "react-native";

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
  return (
    <View
      style={{
        height: 88,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 24,
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
            style={{ height: 48, width: 140 }}
            resizeMode="contain"
          />
        ) : (
          <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "700" }}>
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
          padding: 4,
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
                gap: 8,
                paddingHorizontal: 22,
                paddingVertical: 11,
                borderRadius: 999,
                backgroundColor: active ? "#FFFFFF" : "transparent",
              }}
            >
              <Icon
                size={18}
                color={active ? config.primaryColor : "rgba(255,255,255,0.9)"}
              />
              <Text
                style={{
                  fontSize: 15,
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
            gap: 8,
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.14)",
            borderWidth: 1.5,
            borderColor: "rgba(255,255,255,0.6)",
          }}
        >
          <X size={18} color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
