import type { KioskTemplateProps } from "@/components/kiosk/KioskTemplateRouter";
import { Pressable, Text, View } from "react-native";

/**
 * Template C — its own ordering flow and layout (to be built).
 *
 * Independent screen sequence and layout from Templates A/B; shares logic-only
 * pieces from components/kiosk/shared. Scaffold for now.
 */
export function KioskTemplateC({ config, onExit }: KioskTemplateProps) {
  return (
    <View
      className="flex-1 items-center justify-center px-8"
      style={{ backgroundColor: config.backgroundColor }}
    >
      <Text
        className="text-4xl font-bold"
        style={{ color: config.headerTextColor }}
      >
        Template C
      </Text>
      <Text className="mt-2 text-center" style={{ color: config.textColor }}>
        {config.profileName} · {config.templateId} — flow not built yet.
      </Text>
      <Pressable
        onPress={onExit}
        className="mt-10 px-6 py-3 rounded-full"
        style={{ backgroundColor: config.primaryColor }}
      >
        <Text className="text-white font-semibold">Cancel / Done</Text>
      </Pressable>
    </View>
  );
}
