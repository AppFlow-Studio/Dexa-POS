import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

const StartPage = () => {
  const { isSignedIn, isLoaded } = useAuth();

  // Show loading indicator while Clerk is loading
  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-[#212121]">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  // Redirect based on authentication status
  if (isSignedIn) {
    // User is signed in, redirect to store-select
    return <Redirect href="/store-select" />;
  }

  // User is not signed in, redirect to login
  return <Redirect href="/login" />;
};

export default StartPage;
