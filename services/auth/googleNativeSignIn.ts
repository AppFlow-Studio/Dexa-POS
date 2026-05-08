import { Platform } from "react-native";

export type GoogleNativeSignInResult =
  | { kind: "success"; idToken: string }
  | { kind: "cancelled" }
  | { kind: "unavailable"; reason: string };

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

let configured = false;

const loadModule = async () => {
  try {
    // @ts-ignore — optional native dep; may not be installed yet
    return await import("@react-native-google-signin/google-signin");
  } catch {
    return null;
  }
};

export const signInWithGoogleNative = async (): Promise<GoogleNativeSignInResult> => {
  if (!WEB_CLIENT_ID) {
    return {
      kind: "unavailable",
      reason: "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID not set",
    };
  }

  const mod = await loadModule();
  if (!mod) {
    return {
      kind: "unavailable",
      reason: "@react-native-google-signin/google-signin not installed",
    };
  }

  const { GoogleSignin, statusCodes } = mod;

  if (!configured) {
    GoogleSignin.configure({
      webClientId: WEB_CLIENT_ID,
      iosClientId: Platform.OS === "ios" ? IOS_CLIENT_ID : undefined,
      offlineAccess: false,
    });
    configured = true;
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result: any = await GoogleSignin.signIn();

    // v13+ returns { type: 'success' | 'cancelled', data: { idToken, ... } }
    // older versions return the user object directly with idToken at the top level
    const idToken: string | null | undefined =
      result?.data?.idToken ?? result?.idToken;

    if (result?.type === "cancelled") {
      return { kind: "cancelled" };
    }

    if (!idToken) {
      return {
        kind: "unavailable",
        reason: "No idToken returned from Google Sign-In",
      };
    }

    return { kind: "success", idToken };
  } catch (err: any) {
    const code = err?.code;
    if (
      code === statusCodes?.SIGN_IN_CANCELLED ||
      err?.message?.toLowerCase?.().includes("cancel")
    ) {
      return { kind: "cancelled" };
    }
    if (code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
      return {
        kind: "unavailable",
        reason: "Google Play Services not available on this device",
      };
    }
    throw err;
  }
};
