import { replaceRoute } from "@/lib/rootNavigation";
import { resetClientSession } from "@/services/cacheService";
import { useClerk } from "@clerk/clerk-expo";
import React from "react";
import {
    ActivityIndicator,
    Text,
    TouchableOpacity,
    View,
    ViewStyle,
} from "react-native";

interface SignOutButtonProps {
  style?: ViewStyle;
  showText?: boolean;
}

export const SignOutButton = ({
  style,
  showText = true,
}: SignOutButtonProps) => {
  const { signOut } = useClerk();
  const [isLoading, setIsLoading] = React.useState(false);
  const signOutInFlightRef = React.useRef(false);

  const handleSignOut = async () => {
    if (signOutInFlightRef.current) return;
    try {
      signOutInFlightRef.current = true;
      setIsLoading(true);
      await resetClientSession();
      try {
        await signOut();
      } catch (err) {
        console.warn("Sign out network call failed after local reset:", err);
      }
      // Redirect to login page after sign out
      replaceRoute("(auth)", "login");
    } catch (err) {
      console.error("Error signing out:", JSON.stringify(err, null, 2));
    } finally {
      setIsLoading(false);
      signOutInFlightRef.current = false;
    }
  };

  return (
    <TouchableOpacity
      onPress={handleSignOut}
      disabled={isLoading}
      style={style}
      className="px-4 py-2 bg-red-500 rounded-lg items-center justify-center"
    >
      {isLoading ? (
        <ActivityIndicator color="white" size="small" />
      ) : (
        <View className="flex-row items-center gap-2">
          {showText && (
            <Text className="text-white font-semibold text-lg">Sign Out</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

export default SignOutButton;
