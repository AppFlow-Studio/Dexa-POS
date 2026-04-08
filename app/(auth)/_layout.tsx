import MerchantBrandingPanel from "@/components/auth/MerchantBrandingPanel";
import { images } from "@/lib/image";
import { spinnerColor } from "@/lib/theme";
import { useAuth } from "@clerk/clerk-expo";
import { Slot, usePathname } from "expo-router";
import React from "react";
import { ActivityIndicator, Image, View } from "react-native";

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const pathname = usePathname();

  // Show loading indicator while Clerk is loading
  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-screen">
        <ActivityIndicator size="large" color={spinnerColor} />
      </View>
    );
  }

  const isPinLogin = pathname === "/pin-login";

  // Note: We don't redirect signed-in users away from this layout because
  // store-select and pin-login pages are in this group and require signed-in users

  return (
    <View className="flex-1 flex-row items-center justify-center bg-screen p-8">
      {/* Left side: branding panel on pin-login, burger image on others */}
      <View className="flex-1 h-full w-1/2">
        {isPinLogin ? (
          <MerchantBrandingPanel />
        ) : (
          <Image
            source={images.loginBurger}
            className="w-full h-full rounded-2xl"
            resizeMode="cover"
          />
        )}
      </View>

      {/* Right side with the content from the active screen */}
      <View className="flex-1 items-center justify-center">
        <View className="w-full p-8">
          {/* Slot renders the content of login.tsx, sign-up.tsx, etc. */}
          <Slot />
        </View>
      </View>
    </View>
  );
}
