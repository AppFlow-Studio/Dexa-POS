import type { KioskOrderType } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { ShoppingBag, UtensilsCrossed } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

/**
 * Shared order-type selection. The customer chooses Dine In or Takeaway; the
 * choice is stored on useKioskCartStore and becomes the order_type when the
 * order is created at checkout. Theme-driven from `config` so any template can
 * use it as a session entry step or a mid-session change screen.
 */
export function KioskOrderTypeScreen({
  config,
  onSelect,
}: {
  config: KioskConfig;
  onSelect: (type: KioskOrderType) => void;
}) {
  const options: {
    type: KioskOrderType;
    label: string;
    Icon: typeof UtensilsCrossed;
  }[] = [
    { type: "dine_in", label: "Dine In", Icon: UtensilsCrossed },
    { type: "takeout", label: "Takeaway", Icon: ShoppingBag },
  ];

  return (
    <View
      className="flex-1 items-center justify-center px-10"
      style={{ backgroundColor: config.backgroundColor }}
    >
      <Text
        className="text-4xl font-bold mb-2"
        style={{ color: config.headerTextColor }}
      >
        How would you like to order?
      </Text>
      <Text
        className="text-lg mb-12"
        style={{ color: `${config.textColor}99` }}
      >
        Select an option to begin
      </Text>

      <View className="flex-row gap-8">
        {options.map(({ type, label, Icon }) => (
          <Pressable
            key={type}
            onPress={() => onSelect(type)}
            style={{
              width: 240,
              height: 240,
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
              backgroundColor: `${config.primaryColor}12`,
              borderWidth: 2,
              borderColor: `${config.primaryColor}40`,
            }}
          >
            <Icon color={config.primaryColor} size={72} />
            <Text
              style={{
                fontSize: 24,
                fontWeight: "700",
                color: config.textColor,
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
