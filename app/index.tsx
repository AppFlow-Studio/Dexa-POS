import { colors } from "@/lib/theme";
import { useCFDClientStore } from "@/stores/useCFDClientStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

const StartPage = () => {
  const { isSignedIn, isLoaded } = useAuth();
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const isCFDMode = useStoreSettingsStore((state) => state.isCFDMode);
  const isPaired = useCFDClientStore((state) => state.isPaired);

  // Show loading indicator while Clerk is loading
  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-screen">
        <ActivityIndicator size="large" color={colors.info} />
      </View>
    );
  }

  // CFD mode: skip auth entirely, go straight to display or pairing
  if (isCFDMode) {
    if (isPaired) {
      return <Redirect href="/(cfd)/cfd-display" />;
    }
    return <Redirect href="/(cfd)/cfd-pairing" />;
  }

  // Redirect based on authentication status and store selection
  if (isSignedIn) {
    // If store is already selected, go directly to pin-login
    if (selectedStore) {
      return <Redirect href="/pin-login" />;
    }
    // Otherwise, go to store-select
    return <Redirect href="/store-select" />;
  }

  // User is not signed in, redirect to login
  return <Redirect href="/login" />;
};

export default StartPage;
