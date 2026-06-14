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
  if (itemCount <= 0) return null;

  return (
    <Pressable
      onPress={onPress}
      style={{
        position: "absolute",
        right: 24,
        bottom: 24,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingLeft: 20,
        paddingRight: 24,
        height: 64,
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
        <ShoppingCart size={26} color="#FFFFFF" />
        <View
          style={{
            position: "absolute",
            top: -8,
            right: -10,
            minWidth: 22,
            height: 22,
            paddingHorizontal: 5,
            borderRadius: 11,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: config.accentColor,
            borderWidth: 2,
            borderColor: config.primaryColor,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "800" }}>
            {itemCount}
          </Text>
        </View>
      </View>

      <Text style={{ color: "#FFFFFF", fontSize: 17, fontWeight: "700" }}>
        View Cart
        {subtotal != null ? `  ·  $${subtotal.toFixed(2)}` : ""}
      </Text>
    </Pressable>
  );
}
