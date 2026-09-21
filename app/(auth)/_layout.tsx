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

/** Landscape tablets: branding on the left, the screen's card on the right (unchanged). */
function SideBySide({ isPinLogin }: { isPinLogin: boolean }) {
  return (
    <View
      className="flex-1 flex-row items-center justify-center p-8"
      style={{ backgroundColor: colors.screen }}
    >
      {/* Left side: branding panel on pin-login, Dexa logo on others */}
      <View className="flex-1 h-full w-1/2">
        {isPinLogin ? (
          <MerchantBrandingPanel />
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

      {/* Right side with the content from the active screen */}
      <View className="flex-1 items-center justify-center">
        <View
          className="w-full p-8 rounded-2xl"
          style={{
            backgroundColor: isPinLogin ? "transparent" : colors.panel,
            borderWidth: isPinLogin ? 0 : 1,
            borderColor: colors.border,
          }}
        >
          {/* Slot renders the content of login.tsx, sign-up.tsx, etc. */}
          <Slot />
        </View>
      </View>
    </View>
  );
}

/**
 * Phones and portrait kiosks: a compact branding row over a full-width card
 * (capped at 480dp so a 1080dp-wide kiosk does not stretch a login form
 * across the screen), scrollable and keyboard-aware.
 */
function Stacked({ isPinLogin }: { isPinLogin: boolean }) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colors.screen }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, padding: 16, alignItems: "center", justifyContent: "center" }}
      >
        <View style={{ width: "100%", maxWidth: 480, gap: 12 }}>
          {isPinLogin ? (
            <MerchantBrandingPanel compact />
          ) : (
            <View className="items-center py-2">
              <Image source={images.dexalogo} style={{ width: 160, height: 44 }} resizeMode="contain" />
            </View>
          )}
          <View
            className="w-full rounded-2xl"
            style={{
              padding: 20,
              backgroundColor: isPinLogin ? "transparent" : colors.panel,
              borderWidth: isPinLogin ? 0 : 1,
              borderColor: colors.border,
            }}
          >
            <Slot />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();
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
  const compact = isCompactViewport(width, height);

  // Note: We don't redirect signed-in users away from this layout because
  // store-select and pin-login pages are in this group and require signed-in users

  // A phone's automatic scale floors at 0.6 (every s()-sized control at
  // 60%); pin it while the frame is stacked. Landscape tablets keep the root
  // scale exactly as before.
  return (
    <FixedUiScaleProvider scale={compact ? computeAuthUiScale(width, height) : null}>
      {compact ? <Stacked isPinLogin={isPinLogin} /> : <SideBySide isPinLogin={isPinLogin} />}
    </FixedUiScaleProvider>
  );
}
