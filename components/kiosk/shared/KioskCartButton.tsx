import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
import type { KioskConfig } from "@/types/kiosk";
import { ShoppingCart } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

/**
 * Floating cart button, pinned bottom-right. Shows the running item count and
 * (optionally) the cart subtotal. Hidden while the cart is empty. Theme-driven
 * from `config`. Place inside a flex-1 parent that allows absolute children.
 */
export function KioskCartButton({
  config,
  itemCount,
  subtotal,
  onPress,
}: {
  config: KioskConfig;
  itemCount: number;
  subtotal?: number;
  onPress: () => void;
}) {
  const s = useKioskUiScale();
  if (itemCount <= 0) return null;

  return (
    <Pressable
      onPress={onPress}
      style={{
        position: "absolute",
        right: kioskPx(24, s),
        bottom: kioskPx(24, s),
        flexDirection: "row",
        alignItems: "center",
        gap: kioskPx(14, s),
        paddingLeft: kioskPx(20, s),
        paddingRight: kioskPx(24, s),
        height: kioskPx(64, s),
        borderRadius: 999,
        backgroundColor: config.primaryColor,
        shadowColor: "#000000",
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      }}
    >
      <View>
        <ShoppingCart size={kioskPx(26, s)} color="#FFFFFF" />
        <View
          style={{
            position: "absolute",
            top: kioskPx(-8, s),
            right: kioskPx(-10, s),
            minWidth: kioskPx(22, s),
            height: kioskPx(22, s),
            paddingHorizontal: kioskPx(5, s),
            borderRadius: kioskPx(11, s),
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: config.accentColor,
            borderWidth: 2,
            borderColor: config.primaryColor,
          }}
        >
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: kioskPx(11, s),
              fontWeight: "800",
            }}
          >
            {itemCount}
          </Text>
        </View>
      </View>

      <Text
        style={{
          color: "#FFFFFF",
          fontSize: kioskPx(17, s),
          fontWeight: "700",
        }}
      >
        View Cart
        {subtotal != null ? `  ·  $${subtotal.toFixed(2)}` : ""}
      </Text>
    </Pressable>
  );
}
