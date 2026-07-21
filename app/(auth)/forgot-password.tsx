import { colors, spinnerColor } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useSignIn } from "@clerk/clerk-expo";
import * as Sentry from "@sentry/react-native";
import { useRouter } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const ANDROID_KEYBOARD_LIFT_OFFSET = 20;

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const mapClerkError = (err: any, fallback: string): string => {
  const code = err?.errors?.[0]?.code as string | undefined;
  const message = err?.errors?.[0]?.message as string | undefined;
  switch (code) {
    case "form_identifier_not_found":
      return "We couldn't find an account with that email.";
    case "form_code_incorrect":
    case "verification_failed":
      return "That code is incorrect or expired. Please try again.";
    case "form_password_pwned":
      return "This password has been found in a data breach. Please choose another.";
    case "form_password_length_too_short":
      return "Password must be at least 8 characters.";
    case "form_password_validation_failed":
      return "Password does not meet the requirements.";
    default:
      return message || fallback;
  }
};

const ForgotPasswordScreen = () => {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const [step, setStep] = useState<"request" | "reset">("request");
  const [emailAddress, setEmailAddress] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestCode = async () => {
    if (!isLoaded) return;
    setError(null);
    if (!isValidEmail(emailAddress)) {
      setError("Please enter a valid email address.");
      return;
    }
    setIsLoading(true);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: emailAddress.trim(),
      });
      setStep("reset");
    } catch (err: any) {
      Sentry.captureException(err, { tags: { source: "forgot_password_request" } });
      setError(mapClerkError(err, "Could not send reset code. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!isLoaded) return;
    setError(null);
    if (!code.trim()) {
      setError("Enter the code we emailed you.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: code.trim(),
        password,
      });
      if (result.status === "complete") {
        await setActive!({ session: result.createdSessionId });
        router.replace("/store-select");
      } else if (result.status === "needs_second_factor") {
        setError(
          "Two-factor authentication is required. Please sign in with your new password."
        );
        setTimeout(() => router.replace("/login"), 1500);
      } else {
        setError("Could not reset password. Please try again.");
      }
    } catch (err: any) {
      Sentry.captureException(err, { tags: { source: "forgot_password_reset" } });
      setError(mapClerkError(err, "Could not reset password. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle = {
    width: "100%" as const,
    paddingHorizontal: s(12),
    paddingVertical: s(10),
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: s(8),
    backgroundColor: colors.screen,
    color: colors.heading,
    fontSize: s(13),
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "position"}
      keyboardVerticalOffset={
        Platform.OS === "ios" ? s(24) : ANDROID_KEYBOARD_LIFT_OFFSET
      }
      style={{ width: "100%" }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: s(16) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: "100%" }}>
          <Text
            style={{
              fontSize: s(15),
              fontWeight: "700",
              color: colors.heading,
              marginBottom: s(4),
            }}
          >
            {step === "request" ? "Forgot Password" : "Reset Password"}
          </Text>
          <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(20) }}>
            {step === "request"
              ? "Enter your email and we'll send you a code to reset your password."
              : `We sent a code to ${emailAddress}. Enter it below along with your new password.`}
          </Text>

          {error && (
            <View
              style={{
                backgroundColor: colors.danger + "15",
                borderWidth: 1,
                borderColor: colors.danger + "40",
                borderRadius: s(8),
                paddingHorizontal: s(12),
                paddingVertical: s(8),
                marginBottom: s(14),
              }}
            >
              <Text
                style={{
                  fontSize: s(12),
                  color: colors.danger,
                  textAlign: "center",
                }}
              >
                {error}
              </Text>
            </View>
          )}

          {step === "request" ? (
            <View style={{ marginBottom: s(16) }}>
              <Text
                style={{
                  fontSize: s(11),
                  fontWeight: "600",
                  color: colors.label,
                  marginBottom: s(5),
                }}
              >
                Email
              </Text>
              <TextInput
                style={inputStyle}
                placeholder="john@example.com"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={emailAddress}
                onChangeText={setEmailAddress}
                editable={!isLoading}
              />
            </View>
          ) : (
            <>
              <View style={{ marginBottom: s(10) }}>
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: "600",
                    color: colors.label,
                    marginBottom: s(5),
                  }}
                >
                  Verification Code
                </Text>
                <TextInput
                  style={inputStyle}
                  placeholder="123456"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  value={code}
                  onChangeText={setCode}
                  editable={!isLoading}
                />
              </View>

              <View style={{ marginBottom: s(10) }}>
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: "600",
                    color: colors.label,
                    marginBottom: s(5),
                  }}
                >
                  New Password
                </Text>
                <View style={{ position: "relative" }}>
                  <TextInput
                    style={{ ...inputStyle, paddingRight: s(40) }}
                    placeholder="••••••••"
                    placeholderTextColor={colors.muted}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    editable={!isLoading}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    style={{
                      position: "absolute",
                      right: s(10),
                      top: 0,
                      bottom: 0,
                      justifyContent: "center",
                    }}
                    hitSlop={{ top: s(8), bottom: s(8), left: s(8), right: s(8) }}
                  >
                    {showPassword ? (
                      <EyeOff size={s(16)} color={colors.muted} />
                    ) : (
                      <Eye size={s(16)} color={colors.muted} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ marginBottom: s(16) }}>
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: "600",
                    color: colors.label,
                    marginBottom: s(5),
                  }}
                >
                  Confirm New Password
                </Text>
                <TextInput
                  style={inputStyle}
                  placeholder="••••••••"
                  placeholderTextColor={colors.muted}
                  secureTextEntry={!showPassword}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  editable={!isLoading}
                />
              </View>
            </>
          )}

          <TouchableOpacity
            onPress={step === "request" ? handleRequestCode : handleResetPassword}
            disabled={isLoading || !isLoaded}
            style={{
              width: "100%",
              paddingVertical: s(11),
              borderRadius: s(10),
              alignItems: "center",
              backgroundColor:
                isLoading || !isLoaded ? colors.teal + "30" : colors.teal,
            }}
          >
            {isLoading ? (
              <ActivityIndicator color={spinnerColor} size="small" />
            ) : (
              <Text
                style={{
                  fontSize: s(13),
                  fontWeight: "700",
                  color: colors.onSolid,
                }}
              >
                {step === "request" ? "Send Reset Code" : "Reset Password"}
              </Text>
            )}
          </TouchableOpacity>

          {step === "reset" && (
            <TouchableOpacity
              onPress={() => {
                setStep("request");
                setCode("");
                setPassword("");
                setConfirmPassword("");
                setError(null);
              }}
              style={{ alignSelf: "center", marginTop: s(12) }}
            >
              <Text
                style={{ fontSize: s(12), fontWeight: "600", color: colors.teal }}
              >
                Use a different email
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => router.replace("/login")}
            style={{ alignSelf: "center", marginTop: s(16) }}
          >
            <Text
              style={{ fontSize: s(12), fontWeight: "600", color: colors.teal }}
            >
              Back to Sign In
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default ForgotPasswordScreen;
