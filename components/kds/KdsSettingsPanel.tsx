import KdsSettingsScreen from "@/app/(main)/settings/kds";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { ChevronLeft } from "lucide-react-native";
import { Text, TouchableOpacity, View } from "react-native";

/**
 * KDS settings as seen from a KDS station: only the KDS settings content (no
 * settings sidebar) under a "Back to KDS" header.
 *
 * The KDS board opens this as a panel over itself rather than navigating to a
 * route: the (main) group swaps routes through <Slot />, so a route change
 * unmounted the whole board and "Back" rebuilt it from scratch — every card,
 * the sound service, polling — which is seconds on a low-end tablet.
 */
export default function KdsSettingsPanel({ onBack }: { onBack: () => void }) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Back to KDS header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: s(12),
          paddingTop: s(12),
          paddingBottom: s(4),
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          accessibilityLabel="Back to KDS"
          style={{
            width: s(32),
            height: s(32),
            borderRadius: s(8),
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            marginRight: s(8),
          }}
        >
          <ChevronLeft size={s(18)} color={colors.label} />
        </TouchableOpacity>
        <Text
          style={{ fontSize: s(15), fontWeight: "700", color: colors.label }}
        >
          Back to KDS
        </Text>
      </View>

      <KdsSettingsScreen />
    </View>
  );
}
