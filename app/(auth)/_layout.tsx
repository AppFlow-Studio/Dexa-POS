import MerchantBrandingPanel from "@/components/auth/MerchantBrandingPanel";
import { useKioskOrientation } from "@/hooks/kiosk/useKioskOrientation";
import { useKioskProfile } from "@/hooks/kiosk/useKioskProfile";
import { images } from "@/lib/image";
import { colors, spinnerColor } from "@/lib/theme";
import { computeAuthUiScale, FixedUiScaleProvider, isCompactViewport } from "@/lib/uiScale";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useAuth } from "@clerk/clerk-expo";
import { Slot, usePathname } from "expo-router";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";

export default function AuthLayout() {
  const { isLoaded } = useAuth();
  const pathname = usePathname();
  const { width, height } = useWindowDimensions();
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const isKiosk = selectedStation?.station_type === "self_service";

  // Lock to the kiosk's configured orientation while still on the auth/PIN
  // screens, so the device rotates before the customer-facing UI appears.
  const { config: kioskConfig } = useKioskProfile();
  useKioskOrientation(kioskConfig?.orientation, isKiosk);

  // Show loading indicator while Clerk is loading
  if (!isLoaded) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.screen }}
      >
        <ActivityIndicator size="large" color={spinnerColor} />
      </View>
    );
  }

  const isPinLogin = pathname === "/pin-login";
  // Portrait (a phone, a vertical kiosk): branding row over a full-width card,
  // scrollable and keyboard-aware, at a pinned scale. Landscape: the original
  // two-column tablet frame, untouched.
  const compact = isCompactViewport(width, height);

  // Note: We don't redirect signed-in users away from this layout because
  // store-select and pin-login pages are in this group and require signed-in users

  // ONE tree for both orientations — only styles change. Choosing a station
  // flips the orientation lock mid-navigation, and a layout that swapped
  // component types here remounted the Slot's navigator at that moment, so
  // the PUSH to pin-login had nothing to handle it. In landscape the
  // KeyboardAvoidingView / ScrollView below are inert containers. The
  // FixedUiScaleProvider is part of that contract: it always declares
  // --ui-scale, because NativeWind remounts a View that gains a vars()
  // style after mount (lib/uiScale.ts).
  return (
    <FixedUiScaleProvider scale={compact ? computeAuthUiScale(width, height) : null}>
      <KeyboardAvoidingView
        behavior={compact && Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: colors.screen }}
      >
        <ScrollView
          scrollEnabled={compact}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={
            compact
              ? { flexGrow: 1, padding: 16, alignItems: "center", justifyContent: "center" }
              : { flex: 1 }
          }
        >
          <View
            className={compact ? undefined : "flex-1 flex-row items-center justify-center p-8"}
            style={compact ? { width: "100%", maxWidth: 480, gap: 12 } : undefined}
          >
            {/* Branding: panel on pin-login, Dexa logo on the others */}
            <View className={compact ? undefined : "flex-1 h-full w-1/2"}>
              {isPinLogin ? (
                <MerchantBrandingPanel compact={compact} />
              ) : compact ? (
                <View className="items-center py-2">
                  <Image source={images.dexalogo} style={{ width: 160, height: 44 }} resizeMode="contain" />
                </View>
              ) : (
                <View
                  className="flex-1 h-full items-center justify-center rounded-2xl p-12"
                  style={{
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Image
                    source={images.dexalogo}
                    className="w-full h-full"
                    resizeMode="contain"
                  />
                </View>
              )}
            </View>

            {/* The active screen's card */}
            <View className={compact ? undefined : "flex-1 items-center justify-center"}>
              <View
                className={compact ? "w-full rounded-2xl" : "w-full p-8 rounded-2xl"}
                style={{
                  padding: compact ? 20 : undefined,
                  backgroundColor: isPinLogin ? "transparent" : colors.panel,
                  borderWidth: isPinLogin ? 0 : 1,
                  borderColor: colors.border,
                }}
              >
                {/* Slot renders the content of login.tsx, pin-login.tsx, etc. */}
                <Slot />
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </FixedUiScaleProvider>
  );
}
