import type { KioskTemplateProps } from "@/components/kiosk/KioskTemplateRouter";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

/**
 * Template A — its own ordering flow and layout.
 *
 * Owns the local screen-state machine for an active session:
 *   menu → itemDetail → cart → checkout → confirmation
 *
 * Layout and screen sequence are specific to this template. Logic with no
 * layout opinion (cart → order conversion, modifier min/max enforcement,
 * payment handoff) is pulled from components/kiosk/shared so templates B and C
 * can reuse it without inheriting A's flow.
 *
 * Theme-driven from `config`. Browses against the local useKioskCartStore;
 * the cart is converted to a real order only at checkout. `onExit` returns the
 * kiosk to the attract/idle screen (where the cart is cleared).
 */
export type TemplateAScreen =
  | "menu"
  | "itemDetail"
  | "cart"
  | "checkout"
  | "confirmation";

export function KioskTemplateA({ config, onExit }: KioskTemplateProps) {
  const [screen, setScreen] = useState<TemplateAScreen>("menu");
  const itemCount = useKioskCartStore((s) => s.itemCount());

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: config.backgroundColor }}
    >
      <View
        className="flex-row items-center justify-between px-6 py-4"
        style={{ backgroundColor: config.primaryColor }}
      >
        <Text className="text-white text-lg font-semibold">
          {config.profileName} · Template A · {config.templateId}
        </Text>
        <Text className="text-white">Cart: {itemCount}</Text>
      </View>

      <View className="flex-1 items-center justify-center px-8">
        <Text
          className="text-3xl font-bold"
          style={{ color: config.headerTextColor }}
        >
          {screen}
        </Text>
        <Text className="mt-2 text-center" style={{ color: config.textColor }}>
          Template A — menu view is built next.
        </Text>

        <Pressable
          onPress={onExit}
          className="mt-10 px-6 py-3 rounded-full"
          style={{ backgroundColor: config.primaryColor }}
        >
          <Text className="text-white font-semibold">Cancel / Done</Text>
        </Pressable>
      </View>
    </View>
  );
}
