import { spinnerColor } from "@/lib/theme";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";

WebBrowser.maybeCompleteAuthSession();

/**
 * OAuth Callback Page
 *
 * This page handles the OAuth callback when returning from the system browser.
 * The expo-web-browser automatically completes the auth session via
 * WebBrowser.maybeCompleteAuthSession() in the login/signup pages.
 *
 * This page serves as a fallback loading state.
 */
export default function SSOCallbackScreen() {
  const router = useRouter();

  React.useEffect(() => {
    // The OAuth flow should be automatically completed by expo-web-browser
    // If we're still here after 5 seconds, redirect back to login
    const timeout = setTimeout(() => {
      router.replace("/login");
    }, 5000);

    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <View className="flex-1 items-center justify-center bg-screen">
      <ActivityIndicator size="large" color={spinnerColor} />
      <Text className="text-white text-xl mt-4">Completing sign-in...</Text>
      <Text className="text-neutral-400 mt-2 text-center px-8">
        Please wait while we verify your credentials
      </Text>
    </View>
  );
}
