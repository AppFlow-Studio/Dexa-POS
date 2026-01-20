import { useOAuth, useSignUp } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
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

export default function SignUpScreen() {
    const { isLoaded, signUp, setActive } = useSignUp();
    const router = useRouter();

    // Native OAuth flow - works in Expo Go
    const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });

    const [emailAddress, setEmailAddress] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [confirmPassword, setConfirmPassword] = React.useState("");
    const [pendingVerification, setPendingVerification] = React.useState(false);
    const [code, setCode] = React.useState("");
    const [isLoading, setIsLoading] = React.useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    // Simple email validation
    const isValidEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    // Google OAuth Sign-Up - Browser-based, works in Expo Go
    const signUpWithGoogle = async () => {
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
                setError("Google sign-up failed. Please try again.");
            }
        } finally {
            setIsGoogleLoading(false);
        }
    };

    // Email/Password Sign-Up
    const onSignUpPress = async () => {
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

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            await signUp.create({
                emailAddress: trimmedEmail,
                password,
            });

            await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
            setPendingVerification(true);
        } catch (err: any) {
            console.error("Sign-up error:", JSON.stringify(err, null, 2));
            if (err.errors && err.errors.length > 0) {
                const errorCode = err.errors[0].code;
                if (errorCode === "form_identifier_exists") {
                    setError("An account with this email already exists. Please sign in.");
                } else if (errorCode === "form_param_format_invalid") {
                    setError("Please enter a valid email address.");
                } else if (errorCode === "form_password_pwned") {
                    setError("This password has been compromised. Please choose a different one.");
                } else {
                    setError(err.errors[0].longMessage || err.errors[0].message || "Sign-up failed.");
                }
            } else {
                setError("An error occurred during sign-up. Please try again.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Verify email code
    const onVerifyPress = async () => {
        if (!isLoaded) return;

        setIsLoading(true);
        setError(null);

        try {
            const signUpAttempt = await signUp.attemptEmailAddressVerification({ code });

            if (signUpAttempt.status === "complete") {
                await setActive({ session: signUpAttempt.createdSessionId });
                router.replace("/store-select");
            } else {
                console.error(JSON.stringify(signUpAttempt, null, 2));
                setError("Verification incomplete. Please try again.");
            }
        } catch (err: any) {
            console.error("Verification error:", JSON.stringify(err, null, 2));
            if (err.errors && err.errors.length > 0) {
                setError(err.errors[0].message || "Invalid verification code");
            } else {
                setError("Verification failed. Please try again.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    const isFormLoading = isLoading || isGoogleLoading;

    // Verification screen
    if (pendingVerification) {
        return (
            <View className="w-full">
                <Text className="text-3xl font-semibold text-white text-center mb-4">
                    Verify Your Email
                </Text>
                <Text className="text-neutral-400 text-center mb-8">
                    We've sent a verification code to {emailAddress}
                </Text>

                {error && (
                    <View className="bg-red-500/20 border border-red-500 rounded-xl p-4 mb-4">
                        <Text className="text-red-400 text-center">{error}</Text>
                    </View>
                )}

                <KeyboardAvoidingView behavior="padding" className="mb-6">
                    <Text className="text-xl font-medium text-white mb-2">
                        Verification Code
                    </Text>
                    <TextInput
                        className="w-full p-4 h-16 border text-white border-neutral-200 rounded-xl text-xl text-center tracking-widest"
                        value={code}
                        placeholder="Enter 6-digit code"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="number-pad"
                        onChangeText={setCode}
                        maxLength={6}
                        editable={!isLoading}
                    />
                </KeyboardAvoidingView>

                <TouchableOpacity
                    onPress={onVerifyPress}
                    disabled={isLoading || code.length < 6}
                    className={`w-full p-4 rounded-xl items-center ${isLoading || code.length < 6 ? "bg-green-400" : "bg-green-600"
                        }`}
                >
                    {isLoading ? (
                        <ActivityIndicator color="white" size="small" />
                    ) : (
                        <Text className="text-white text-xl font-bold">Verify Email</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => setPendingVerification(false)}
                    className="mt-4"
                >
                    <Text className="text-neutral-400 text-center">← Back to sign up</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Sign-up form
    return (
        <View className="w-full">
            <Text className="text-3xl font-semibold text-white text-center mb-8">
                Create Account
            </Text>

            {error && (
                <View className="bg-red-500/20 border border-red-500 rounded-xl p-4 mb-4">
                    <Text className="text-red-400 text-center">{error}</Text>
                </View>
            )}

            {/* Google Sign-Up Button - Browser-based OAuth */}
            <TouchableOpacity
                onPress={signUpWithGoogle}
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
                            Sign up with Google
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
                        placeholder="At least 8 characters"
                        secureTextEntry
                        value={password}
                        onChangeText={setPassword}
                        editable={!isFormLoading}
                    />
                </KeyboardAvoidingView>
            </View>

            <View className="mb-6">
                <Text className="text-xl font-medium text-white mb-2">
                    Confirm Password
                </Text>
                <KeyboardAvoidingView behavior="position">
                    <TextInput
                        className="w-full p-4 h-16 border text-white border-neutral-200 rounded-xl text-xl"
                        placeholderTextColor="#9CA3AF"
                        placeholder="••••••••"
                        secureTextEntry
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        editable={!isFormLoading}
                    />
                </KeyboardAvoidingView>
            </View>

            <TouchableOpacity
                onPress={onSignUpPress}
                disabled={isFormLoading || !emailAddress || !password || !confirmPassword}
                className={`w-full p-4 rounded-xl items-center ${isFormLoading || !emailAddress || !password || !confirmPassword
                        ? "bg-blue-400"
                        : "bg-blue-600"
                    }`}
            >
                {isLoading ? (
                    <ActivityIndicator color="white" size="small" />
                ) : (
                    <Text className="text-white text-xl font-bold">Create Account</Text>
                )}
            </TouchableOpacity>

            <View className="flex-row justify-center mt-6 gap-2">
                <Text className="text-neutral-400 text-lg">Already have an account?</Text>
                <TouchableOpacity onPress={() => router.push("/login")}>
                    <Text className="text-blue-400 text-lg font-semibold">Sign in</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
