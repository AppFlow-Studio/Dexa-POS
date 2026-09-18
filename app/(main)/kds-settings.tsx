import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Text, TouchableOpacity, View } from "react-native";
import KdsSettingsScreen from "./settings/kds";

/**
 * Standalone KDS settings page used when the current device is a KDS station.
 *
 * The normal `/settings/kds` route renders inside SettingsLayout (with the
 * sidebar navigation). When on a KDS device, the settings gear navigates here
 * instead so the user sees only the KDS settings content — no sidebar, no
 * full settings layout. A "Back to KDS" button is shown at the top.
 */
export default function KdsSettingsPage() {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const router = useRouter();

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
          onPress={() => router.back()}
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
