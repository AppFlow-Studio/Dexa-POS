import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

const StartPage = () => {
  const { isSignedIn, isLoaded } = useAuth();
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  // console.log("isSignedIn", isSignedIn);
  // console.log("isLoaded", isLoaded);
  // console.log("selectedStore", selectedStore?.name);

  // Show loading indicator while Clerk is loading
  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-[#212121]">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
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
