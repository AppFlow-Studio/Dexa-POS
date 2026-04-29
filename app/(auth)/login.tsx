import { colors, spinnerColor } from "@/lib/theme";
import { useSSO, useSignIn } from "@clerk/clerk-expo";
import * as Sentry from "@sentry/react-native";
import * as Linking from "expo-linking";
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
import Svg, { ClipPath, Defs, G, Path, Rect } from "react-native-svg";

const GoogleIcon = ({ size = 18 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Defs>
      <ClipPath id="clip">
        <Rect width={48} height={48} rx={24} />
      </ClipPath>
    </Defs>
    <G clipPath="url(#clip)">
      <Path
        fill="#4285F4"
        d="M47.5 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.6 7.3-17.4z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.5 0 12-2.2 16-5.8l-7.9-6c-2.2 1.5-5 2.3-8.1 2.3-6.2 0-11.5-4.2-13.4-9.9H2.5v6.2C6.4 42.6 14.6 48 24 48z"
      />
      <Path
        fill="#FBBC05"
        d="M10.6 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6v-6.2H2.5C.9 16.4 0 20.1 0 24s.9 7.6 2.5 10.8l8.1-6.2z"
      />
      <Path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.9 2.2 30.4 0 24 0 14.6 0 6.4 5.4 2.5 13.2l8.1 6.2C12.5 13.7 17.8 9.5 24 9.5z"
      />
    </G>
  </Svg>
);

const ANDROID_KEYBOARD_LIFT_OFFSET = 20;

const MerchantLoginScreen = () => {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();
  const LinkRedirectUrl = Linking.createURL("oauth-native-callback", {
    scheme: "dexapos",
  });

  const { startSSOFlow } = useSSO();

  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Second factor state
  const [needsSecondFactor, setNeedsSecondFactor] = useState(false);
  const [secondFactorCode, setSecondFactorCode] = useState("");
  const [secondFactorStrategy, setSecondFactorStrategy] = useState<
    string | null
  >(null);
  const [secondFactorHint, setSecondFactorHint] = useState<string | null>(null);

  const isValidEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const signInWithGoogle = async () => {
    setIsGoogleLoading(true);
    setError(null);
    try {
      const { createdSessionId, setActive: setActiveSession } =
        await startSSOFlow({
          strategy: "oauth_google",
          redirectUrl: LinkRedirectUrl,
        });
      if (createdSessionId) {
        await setActiveSession!({ session: createdSessionId });
        router.replace("/store-select");
      }
    } catch (err: any) {
      if (!err?.message?.includes("cancel")) {
        Sentry.captureException(err, { tags: { source: "google_oauth" } });
        setError("Google sign-in failed. Please try again.");
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  /** Complete sign-in after the session is created. */
  const completeSignIn = async (createdSessionId: string | null) => {
    if (!createdSessionId || !setActive) {
      setError("Sign-in failed — no session created.");
      return;
    }
    await setActive({ session: createdSessionId });
    router.replace("/store-select");
  };

  // TODO: Test this out

  /** Pick the best second factor and prepare it (sends SMS if phone_code). */
  const initiateSecondFactor = async () => {
    if (!signIn) return;
    const factors = signIn.supportedSecondFactors;
    if (!factors || factors.length === 0) {
      setError("No second factor methods available. Contact your admin.");
      return;
    }

    // Prefer TOTP > phone_code > email_code > backup_code
    const preferred =
      factors.find((f: any) => f.strategy === "totp") ??
      factors.find((f: any) => f.strategy === "phone_code") ??
      factors.find((f: any) => f.strategy === "email_code") ??
      factors[0];

    const strategy = (preferred as any).strategy as string;
    setSecondFactorStrategy(strategy);

    // Build a human-readable hint
    if (strategy === "totp") {
      setSecondFactorHint("Enter the code from your authenticator app");
    } else if (strategy === "phone_code") {
      const safeId = (preferred as any).safeIdentifier ?? "your phone";
      setSecondFactorHint(`Enter the code sent to ${safeId}`);
      // Prepare sends the SMS/WhatsApp message
      await signIn.prepareSecondFactor({ strategy: "phone_code" } as any);
    } else if (strategy === "email_code") {
      const safeId = (preferred as any).safeIdentifier ?? "your email";
      setSecondFactorHint(`Enter the code sent to ${safeId}`);
      await signIn.prepareSecondFactor({ strategy: "email_code" } as any);
    } else if (strategy === "backup_code") {
      setSecondFactorHint("Enter one of your backup codes");
    } else {
      setSecondFactorHint("Enter your verification code");
    }

    setNeedsSecondFactor(true);
  };

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
      if (!signIn) return;
      // Step 1: Create sign-in attempt
      const attempt = await signIn.create({ identifier: trimmedEmail });

      // Some configs complete immediately (e.g. SSO redirect resolved)
      if (attempt.status === "complete") {
        await completeSignIn(attempt.createdSessionId);
        return;
      }

      // Step 2: Verify password as first factor
      if (attempt.status === "needs_first_factor") {
        const result = await signIn.attemptFirstFactor({
          strategy: "password",
          password,
        });

        if (result.status === "complete") {
          await completeSignIn(result.createdSessionId);
          return;
        }

        // Step 3: Device not trusted — second factor required
        if (result.status === "needs_second_factor") {
          await initiateSecondFactor();
          return;
        }

        setError(`Unexpected status: ${result.status}`);
        return;
      }

      setError("Sign-in incomplete. Please try again.");
    } catch (err: any) {
      if (err.errors?.length > 0) {
        const code = err.errors[0].code;
        if (code === "form_identifier_not_found") {
          setError("No account found with this email.");
        } else if (code === "form_password_incorrect") {
          setError("Incorrect password. Please try again.");
        } else if (code === "form_param_format_invalid") {
          setError("Please enter a valid email address.");
        } else {
          setError(
            err.errors[0].longMessage ||
              err.errors[0].message ||
              "Invalid email or password",
          );
        }
      } else {
        Sentry.captureException(err, {
          tags: { source: "login", step: "handleLogin" },
        });
        setError("An error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  /** Submit the second factor verification code. */
  const handleSecondFactor = async () => {
    if (!secondFactorStrategy || !secondFactorCode.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      if (!signIn) return;
      const result = await signIn.attemptSecondFactor({
        strategy: secondFactorStrategy,
        code: secondFactorCode.trim(),
      } as any);

      if (result.status === "complete") {
        await completeSignIn(result.createdSessionId);
        return;
      }

      setError(`Unexpected status: ${result.status}`);
    } catch (err: any) {
      if (err.errors?.length > 0) {
        const code = err.errors[0].code;
        if (code === "form_code_incorrect") {
          setError("Incorrect code. Please try again.");
        } else {
          setError(
            err.errors[0].longMessage ||
              err.errors[0].message ||
              "Verification failed.",
          );
        }
      } else {
        setError("Verification failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetSecondFactor = () => {
    setNeedsSecondFactor(false);
    setSecondFactorCode("");
    setSecondFactorStrategy(null);
    setSecondFactorHint(null);
    setError(null);
  };

  const isFormLoading = isLoading || isGoogleLoading;
  const canSubmit = !!emailAddress && !!password && !isFormLoading;
  const canSubmitCode = !!secondFactorCode.trim() && !isFormLoading;

  // ==================== SECOND FACTOR VERIFICATION UI ====================
  if (needsSecondFactor) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "position"}
        keyboardVerticalOffset={
          Platform.OS === "ios" ? 24 : ANDROID_KEYBOARD_LIFT_OFFSET
        }
        style={{ width: "100%" }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: "100%" }}>
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: colors.heading,
                marginBottom: 4,
              }}
            >
              Verify Your Identity
            </Text>
            <Text
              style={{ fontSize: 11, color: colors.muted, marginBottom: 20 }}
            >
              {secondFactorHint ?? "Enter your verification code"}
            </Text>

            {/* Error banner */}
            {error && (
              <View
                style={{
                  backgroundColor: colors.danger + "15",
                  borderWidth: 1,
                  borderColor: colors.danger + "40",
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  marginBottom: 14,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.danger,
                    textAlign: "center",
                  }}
                >
                  {error}
                </Text>
              </View>
            )}

            {/* Code input */}
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: colors.label,
                marginBottom: 5,
              }}
            >
              Verification Code
            </Text>
            <TextInput
              style={{
                width: "100%",
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                backgroundColor: colors.screen,
                color: colors.heading,
                fontSize: 18,
                letterSpacing: 4,
                textAlign: "center",
              }}
              placeholder="000000"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              autoCapitalize="none"
              autoFocus
              value={secondFactorCode}
              onChangeText={setSecondFactorCode}
              editable={!isFormLoading}
              maxLength={secondFactorStrategy === "backup_code" ? 20 : 6}
            />

            {/* Verify button */}
            <TouchableOpacity
              onPress={handleSecondFactor}
              disabled={!canSubmitCode}
              style={{
                width: "100%",
                paddingVertical: 11,
                borderRadius: 10,
                alignItems: "center",
                backgroundColor: canSubmitCode
                  ? colors.teal
                  : colors.teal + "30",
                marginTop: 16,
              }}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.onSolid} size="small" />
              ) : (
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: canSubmitCode ? colors.onSolid : colors.muted,
                  }}
                >
                  Verify
                </Text>
              )}
            </TouchableOpacity>

            {/* Back to login */}
            <TouchableOpacity
              onPress={resetSecondFactor}
              style={{ alignSelf: "center", marginTop: 16 }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}
              >
                Back to Sign In
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ==================== LOGIN FORM UI ====================
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "position"}
      keyboardVerticalOffset={
        Platform.OS === "ios" ? 24 : ANDROID_KEYBOARD_LIFT_OFFSET
      }
      style={{ width: "100%" }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: "100%" }}>
          {/* Title */}
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: colors.heading,
              marginBottom: 4,
            }}
          >
            Merchant Login
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 20 }}>
            Sign in to your account to continue
          </Text>

          {/* Error banner */}
          {error && (
            <View
              style={{
                backgroundColor: colors.danger + "15",
                borderWidth: 1,
                borderColor: colors.danger + "40",
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginBottom: 14,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: colors.danger,
                  textAlign: "center",
                }}
              >
                {error}
              </Text>
            </View>
          )}

          {/* Google button */}
          <TouchableOpacity
            onPress={signInWithGoogle}
            disabled={isFormLoading}
            style={{
              width: "100%",
              paddingVertical: 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: isFormLoading ? colors.card : colors.panel,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 16,
              opacity: isFormLoading ? 0.6 : 1,
            }}
          >
            {isGoogleLoading ? (
              <ActivityIndicator color={spinnerColor} size="small" />
            ) : (
              <>
                <GoogleIcon size={18} />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors.heading,
                  }}
                >
                  Continue with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 16,
              gap: 10,
            }}
          >
            <View
              style={{ flex: 1, height: 1, backgroundColor: colors.border }}
            />
            <Text style={{ fontSize: 11, color: colors.muted }}>or</Text>
            <View
              style={{ flex: 1, height: 1, backgroundColor: colors.border }}
            />
          </View>

          {/* Email */}
          <View style={{ marginBottom: 10 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: colors.label,
                marginBottom: 5,
              }}
            >
              Email
            </Text>
            <TextInput
              style={{
                width: "100%",
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                backgroundColor: colors.screen,
                color: colors.heading,
                fontSize: 13,
              }}
              placeholder="john@example.com"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              value={emailAddress}
              onChangeText={setEmailAddress}
              editable={!isFormLoading}
            />
          </View>

          {/* Password */}
          <View style={{ marginBottom: 8 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: colors.label,
                marginBottom: 5,
              }}
            >
              Password
            </Text>
            <View style={{ position: "relative" }}>
              <TextInput
                style={{
                  width: "100%",
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  paddingRight: 40,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  backgroundColor: colors.screen,
                  color: colors.heading,
                  fontSize: 13,
                }}
                placeholder="••••••••"
                placeholderTextColor={colors.muted}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                editable={!isFormLoading}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={{
                  position: "absolute",
                  right: 10,
                  top: 0,
                  bottom: 0,
                  justifyContent: "center",
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {showPassword ? (
                  <EyeOff size={16} color={colors.muted} />
                ) : (
                  <Eye size={16} color={colors.muted} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Forgot password */}
          <TouchableOpacity style={{ alignSelf: "flex-end", marginBottom: 16 }}>
            <Text
              style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}
            >
              Forgot Password?
            </Text>
          </TouchableOpacity>

          {/* Login button */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={!canSubmit}
            style={{
              width: "100%",
              paddingVertical: 11,
              borderRadius: 10,
              alignItems: "center",
              backgroundColor: canSubmit ? colors.teal : colors.teal + "30",
            }}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.onSolid} size="small" />
            ) : (
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: canSubmit ? colors.onSolid : colors.muted,
                }}
              >
                Sign In
              </Text>
            )}
          </TouchableOpacity>

          {/* Sign up */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              marginTop: 16,
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.muted }}>
              Don't have an account?
            </Text>
            <TouchableOpacity onPress={() => router.push("/sign-up" as any)}>
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}
              >
                Sign up
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default MerchantLoginScreen;
