import { useOAuth, useSignIn } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// IMPORTANT: Must be called at module level for Expo Go
WebBrowser.maybeCompleteAuthSession();

const MerchantLoginScreen = () => {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();

  // Native OAuth flow - works in Expo Go
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });

  const [emailAddress, setEmailAddress] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Simple email validation
  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Google OAuth Sign-In - Browser-based, works in Expo Go
  const signInWithGoogle = async () => {
    setIsGoogleLoading(true);
    setError(null);

    try {
      const { createdSessionId, setActive: setActiveSession } =
        await startOAuthFlow();

      if (createdSessionId) {
        await setActiveSession!({ session: createdSessionId });
        router.replace("/store-select");
      }
    } catch (err: any) {
      console.log("OAuth error:", err);
      // Don't show error for user cancellation
      if (!err?.message?.includes("cancel")) {
        setError("Google sign-in failed. Please try again.");
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Email/Password Sign-In
  const handleLogin = async () => {
    if (!isLoaded) return;

    const trimmedEmail = emailAddress.trim().toLowerCase();

    if (!trimmedEmail) {
      setError("Please enter your email address");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    if (!password) {
      setError("Please enter your password");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const signInAttempt = await signIn.create({
        identifier: trimmedEmail,
        password,
      });

      if (signInAttempt.status === "complete") {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace("/store-select");
      } else {
        console.error(JSON.stringify(signInAttempt, null, 2));
        setError("Sign-in incomplete. Please try again.");
      }
    } catch (err: any) {
      console.error("Sign-in error:", JSON.stringify(err, null, 2));
      if (err.errors && err.errors.length > 0) {
        const errorCode = err.errors[0].code;
        if (errorCode === "form_identifier_not_found") {
          setError("No account found with this email. Please sign up first.");
        } else if (errorCode === "form_password_incorrect") {
          setError("Incorrect password. Please try again.");
        } else if (errorCode === "form_param_format_invalid") {
          setError("Please enter a valid email address.");
        } else {
          setError(
            err.errors[0].longMessage ||
            err.errors[0].message ||
            "Invalid email or password"
          );
        }
      } else {
        setError("An error occurred during sign-in. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isFormLoading = isLoading || isGoogleLoading;

  return (
    <View className="w-full">
      <Text className="text-3xl font-semibold text-white text-center mb-8">
        Merchant Login
      </Text>

      {error && (
        <View className="bg-red-500/20 border border-red-500 rounded-xl p-4 mb-4">
          <Text className="text-red-400 text-center">{error}</Text>
        </View>
      )}

      {/* Google Sign-In Button - Browser-based OAuth */}
      <TouchableOpacity
        onPress={signInWithGoogle}
        disabled={isFormLoading}
        className={`w-full p-4 rounded-xl items-center justify-center flex-row mb-6 ${isFormLoading ? "bg-neutral-600" : "bg-white"
          }`}
      >
        {isGoogleLoading ? (
          <ActivityIndicator color="#4285F4" size="small" />
        ) : (
          <>
            <Image
              source={{
                uri: "https://developers.google.com/identity/images/g-logo.png",
              }}
              className="w-6 h-6 mr-3"
              resizeMode="contain"
            />
            <Text className="text-neutral-800 text-xl font-semibold">
              Continue with Google
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Divider */}
      <View className="flex-row items-center mb-6">
        <View className="flex-1 h-[1px] bg-neutral-600" />
        <Text className="text-neutral-400 mx-4 text-lg">or</Text>
        <View className="flex-1 h-[1px] bg-neutral-600" />
      </View>

      <KeyboardAvoidingView behavior="padding" className="mb-4">
        <Text className="text-xl font-medium text-white mb-2">Email</Text>
        <TextInput
          className="w-full p-4 h-16 border text-white border-neutral-200 rounded-xl text-xl"
          placeholder="john@gmail.com"
          placeholderTextColor="#9CA3AF"
          keyboardType="email-address"
          autoCapitalize="none"
          value={emailAddress}
          onChangeText={setEmailAddress}
          editable={!isFormLoading}
        />
      </KeyboardAvoidingView>

      <View className="mb-4">
        <Text className="text-xl font-medium text-white mb-2">Password</Text>
        <KeyboardAvoidingView behavior="position">
          <TextInput
            className="w-full p-4 h-16 border text-white border-neutral-200 rounded-xl text-xl"
            placeholderTextColor="#9CA3AF"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!isFormLoading}
          />
        </KeyboardAvoidingView>
      </View>

      <TouchableOpacity className="self-end mb-6">
        <Text className="text-lg font-semibold text-white">
          Forgot Password
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleLogin}
        disabled={isFormLoading || !emailAddress || !password}
        className={`w-full p-4 rounded-xl items-center ${isFormLoading || !emailAddress || !password
            ? "bg-blue-400"
            : "bg-blue-600"
          }`}
      >
        {isLoading ? (
          <ActivityIndicator color="white" size="small" />
        ) : (
          <Text className="text-white text-xl font-bold">Login</Text>
        )}
      </TouchableOpacity>

      <View className="flex-row justify-center mt-6 gap-2">
        <Text className="text-neutral-400 text-lg">Don't have an account?</Text>
        <TouchableOpacity onPress={() => router.push("/sign-up" as any)}>
          <Text className="text-blue-400 text-lg font-semibold">Sign up</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default MerchantLoginScreen;
