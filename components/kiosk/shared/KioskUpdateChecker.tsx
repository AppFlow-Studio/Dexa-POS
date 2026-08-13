import AppUpdateModal from "@/components/AppUpdateModal";
import {
  checkForNativeUpdate,
  type VersionManifest,
} from "@/services/appUpdater";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  RefreshCw,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

const cardShadow: ViewStyle = {
  shadowColor: "#0F172A",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 4,
  elevation: 1,
};

type UpdateStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "up-to-date"
  | "error";

/**
 * On-device "Check for Updates" card for the kiosk diagnostics. Mirrors the POS
 * settings updater: prefers a native APK update (Android, via the CDN version
 * manifest) and falls back to an Expo OTA update. Fully self-contained so it can
 * drop into the diagnostics About section.
 */
export function KioskUpdateChecker() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [nativeManifest, setNativeManifest] = useState<VersionManifest | null>(
    null,
  );

  const version = Constants.expoConfig?.version ?? "—";
  const runtime =
    typeof Updates.runtimeVersion === "string" ? Updates.runtimeVersion : "—";

  const applyOtaUpdate = async () => {
    setStatus("downloading");
    try {
      await Updates.fetchUpdateAsync();
      setStatus("ready");
      setTimeout(() => {
        Updates.reloadAsync();
      }, 1500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const handleCheck = async () => {
    if (status === "checking" || status === "downloading" || status === "ready")
      return;

    setStatus("checking");
    try {
      // 1. Native APK update (Android only) — opens AppUpdateModal.
      if (Platform.OS === "android") {
        const manifest = await checkForNativeUpdate();
        if (manifest) {
          setStatus("idle");
          setNativeManifest(manifest);
          return;
        }
      }

      // 2. Expo OTA update (skipped in dev — updates are disabled there).
      if (!__DEV__) {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          setStatus("idle");
          Alert.alert(
            "Update Available",
            "A new update is ready to download. The app will restart after installing.",
            [
              { text: "Later", style: "cancel" },
              { text: "Update Now", onPress: () => applyOtaUpdate() },
            ],
          );
          return;
        }
      }

      // 3. Nothing newer.
      setStatus("up-to-date");
      setTimeout(() => setStatus("idle"), 3000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const busy =
    status === "checking" || status === "downloading" || status === "ready";
  const buttonLabel =
    status === "checking"
      ? "Checking…"
      : status === "downloading"
        ? "Downloading…"
        : status === "ready"
          ? "Restarting…"
          : "Check for Updates";

  return (
    <View style={{ gap: 10 }}>
      <View className="flex-row items-center gap-2">
        <RefreshCw size={16} color="#6B7280" />
        <Text className="text-sm font-bold text-gray-500 uppercase tracking-wide">
          Software Updates
        </Text>
      </View>

      <View
        className="rounded-3xl border border-gray-200 bg-white p-5"
        style={cardShadow}
      >
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-base font-bold text-gray-900">Dexa POS</Text>
          {status === "up-to-date" ? (
            <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100">
              <CheckCircle2 size={13} color="#16A34A" />
              <Text className="text-xs font-bold text-green-700">
                Up to date
              </Text>
            </View>
          ) : status === "error" ? (
            <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100">
              <AlertCircle size={13} color="#DC2626" />
              <Text className="text-xs font-bold text-red-700">
                Check failed
              </Text>
            </View>
          ) : null}
        </View>

        <Text className="text-sm text-gray-400 mb-4">
          Version {version} · Runtime {runtime}
        </Text>

        <TouchableOpacity
          onPress={handleCheck}
          disabled={busy}
          activeOpacity={0.9}
          className="py-4 rounded-2xl items-center flex-row justify-center bg-teal-600"
          style={{ opacity: busy ? 0.7 : 1 }}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Download size={17} color="#FFFFFF" />
          )}
          <Text className="text-base font-bold text-white ml-2">
            {buttonLabel}
          </Text>
        </TouchableOpacity>

        {__DEV__ ? (
          <Text className="text-xs text-gray-400 text-center mt-2">
            Updates are disabled in development builds.
          </Text>
        ) : null}
      </View>

      {/* Native APK install flow (Android). */}
      {nativeManifest && Platform.OS === "android" ? (
        <AppUpdateModal
          visible={!!nativeManifest}
          manifest={nativeManifest}
          onSkip={() => setNativeManifest(null)}
          onInstallComplete={() => setNativeManifest(null)}
        />
      ) : null}
    </View>
  );
}
