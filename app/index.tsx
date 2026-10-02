import { isUnattendedStation } from "@/lib/authFlow";
import { colors } from "@/lib/theme";
import { useCFDClientStore } from "@/stores/useCFDClientStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

const StartPage = () => {
  const { isSignedIn, isLoaded } = useAuth();
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const selectedStation = useStoreSettingsStore(
    (state) => state.selectedStation,
  );
  const stationSessionId = useStoreSettingsStore(
    (state) => state.stationSessionId,
  );
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
    if (selectedStore) {
      // KDS and kiosk stations have no PIN step: reopen the station's screen
      // on its saved session, or pick the station again to start a new one.
      if (isUnattendedStation(selectedStation?.station_type)) {
        if (!stationSessionId) return <Redirect href="/station-select" />;
        return (
          <Redirect
            href={selectedStation?.station_type === "kds" ? "/kds" : "/kiosk"}
          />
        );
      }
      // Every other station signs in with a staff PIN.
      return <Redirect href="/pin-login" />;
    }
    // Otherwise, go to store-select
    return <Redirect href="/store-select" />;
  }

  // User is not signed in, redirect to login
  return <Redirect href="/login" />;
};

export default StartPage;
