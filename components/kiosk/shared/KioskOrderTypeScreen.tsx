import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import { useKioskUiScale } from "@/lib/uiScale";
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

  const s = useKioskUiScale();
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
              width: kioskPx(240, s),
              height: kioskPx(240, s),
              borderRadius: kioskPx(24, s),
              alignItems: "center",
              justifyContent: "center",
              gap: kioskPx(20, s),
              backgroundColor: `${config.primaryColor}12`,
              borderWidth: 2,
              borderColor: `${config.primaryColor}40`,
            }}
          >
            <Icon color={config.primaryColor} size={kioskPx(72, s)} />
            <Text
              style={{
                fontSize: kioskPx(24, s),
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
