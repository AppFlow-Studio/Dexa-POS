import MerchantBrandingPanel from "@/components/auth/MerchantBrandingPanel";
import { useKioskOrientation } from "@/hooks/kiosk/useKioskOrientation";
import { useKioskProfile } from "@/hooks/kiosk/useKioskProfile";
import { images } from "@/lib/image";
import { colors, spinnerColor } from "@/lib/theme";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useAuth } from "@clerk/clerk-expo";
import { Slot, usePathname } from "expo-router";
import { ActivityIndicator, Image, View } from "react-native";

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const pathname = usePathname();
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const isKiosk = selectedStation?.station_type === "self_service";

  // Lock to the kiosk's configured orientation while still on the auth/PIN
  // screens, so the device rotates before the customer-facing UI appears.
  const { config: kioskConfig } = useKioskProfile();
  useKioskOrientation(isKiosk ? kioskConfig?.orientation : undefined);

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

  // Note: We don't redirect signed-in users away from this layout because
  // store-select and pin-login pages are in this group and require signed-in users

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
