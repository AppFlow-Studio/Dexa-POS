import appJson from "@/app.json";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getDeviceId } from "@/lib/deviceId";
import { replaceRoute } from "@/lib/rootNavigation";
import { toastService } from "@/lib/toastService";
import { clearStationData } from "@/services/cacheService";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { KioskConfig } from "@/types/kiosk";
import { LogOut, Wifi, WifiOff, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

/**
 * Read-only kiosk diagnostics / settings overview. Reached by holding the
 * logo on the attract screen and entering a manager PIN. Shows the resolved
 * kiosk profile, station/location wiring, and live connectivity — enough for
 * staff to confirm "is this kiosk configured correctly and online" without
 * leaving the device.
 */
export function KioskDiagnosticsScreen({
  config,
  onClose,
}: {
  config: KioskConfig;
  onClose: () => void;
}) {
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const { isOnline, rawIsOnline, quality, pendingSyncCount } =
    useNetworkStatus();

  // ── End Station Session ────────────────────────────────────────────
  const supabase = useSupabaseClient();
  const stationSessionId = useStoreSettingsStore((s) => s.stationSessionId);
  const clearStationSession = useStoreSettingsStore(
    (s) => s.clearStationSession,
  );

  const [showConfirm, setShowConfirm] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  const endStationSessionOnServer = async () => {
    if (!stationSessionId || !selectedStore) return;
    try {
      await supabase.rpc("pos_staff_logout", {
        p_session_id: stationSessionId,
        p_location_id: selectedStore.id,
        p_pin_code: "",
        p_device_id: getDeviceId(),
        p_clock_out: false,
      });
    } catch {
      // Non-blocking
    }
  };

  const handleEndSession = async () => {
    if (isEnding) return;
    setIsEnding(true);
    try {
      await endStationSessionOnServer();
      clearStationSession();
      clearStationData();
      setShowConfirm(false);
      onClose();
      toastService.show({
        title: "Session Ended",
        message: "Station session has been ended.",
        type: "success",
      });
      replaceRoute("(auth)", "station-select");
    } catch {
      toastService.show({
        title: "Error",
        message: "Failed to end session. Please try again.",
        type: "error",
      });
    } finally {
      setIsEnding(false);
    }
  };

  return (
    <View className="flex-1 bg-white">
      <View className="flex-row items-center justify-between px-6 pt-14 pb-4 border-b border-gray-200">
        <Text className="text-2xl font-bold text-black">Kiosk Diagnostics</Text>
        <Pressable
          onPress={onClose}
          className="w-11 h-11 rounded-full bg-gray-100 items-center justify-center"
        >
          <X size={22} color="#0A0A0A" />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1 px-6 py-4"
        contentContainerStyle={{ gap: 16 }}
      >
        <Section title="Connectivity">
          <Row
            label="Network"
            value={rawIsOnline ? "Online" : "Offline"}
            icon={
              rawIsOnline ? (
                <Wifi size={18} color="#16A34A" />
              ) : (
                <WifiOff size={18} color="#DC2626" />
              )
            }
          />
          <Row label="Connection quality" value={quality} />
          <Row
            label="Effective status"
            value={isOnline ? "Online" : "Degraded / Offline"}
          />
          <Row label="Pending syncs" value={String(pendingSyncCount)} />
        </Section>

        <Section title="Station">
          <Row label="Location" value={selectedStore?.name ?? "—"} />
          <Row label="Station" value={selectedStation?.station_name ?? "—"} />
          <Row label="Station ID" value={selectedStation?.id ?? "—"} mono />
        </Section>

        <Section title="Kiosk Profile">
          <Row label="Profile name" value={config.profileName} />
          <Row label="Profile ID" value={config.id} mono />
          <Row label="Template" value={config.templateId} />
          <Row label="Orientation" value={config.orientation} />
          <Row label="Idle timeout" value={`${config.idleTimeoutSeconds}s`} />
          <Row
            label="Cart reset timeout"
            value={`${config.cartResetTimeoutSeconds}s`}
          />
          <Row
            label="Payment terminal"
            value={config.paymentTerminalId ?? "Not linked"}
            mono
          />
          <Row label="Published" value={config.publishedAt ?? "Never"} />
          <Row label="Active" value={config.isActive ? "Yes" : "No"} />
        </Section>

        <Section title="App">
          <Row label="Version" value={appJson.expo.version} />
        </Section>

        {/* ── End Station Session ── */}
        <View className="pt-4 pb-8">
          <Pressable
            onPress={() => setShowConfirm(true)}
            disabled={isEnding}
            className="flex-row items-center justify-center px-4 py-4 rounded-2xl border border-red-200 bg-red-50"
          >
            <LogOut size={20} color="#DC2626" />
            <Text className="text-base font-semibold text-red-600 ml-3">
              {isEnding ? "Ending session…" : "End Station Session"}
            </Text>
          </Pressable>
          <Text className="text-xs text-gray-400 text-center mt-2">
            Ends the station session and returns to station selection
          </Text>
        </View>
      </ScrollView>

      {showConfirm && (
        <View className="absolute inset-0 bg-black/40 items-center justify-center px-6">
          <View className="w-full max-w-sm bg-white rounded-2xl p-6">
            <Text className="text-lg font-bold text-black text-center mb-2">
              End Station Session
            </Text>
            <Text className="text-sm text-gray-500 text-center mb-6">
              This will end the current station session and return you to
              station selection. Your account will remain logged in.
            </Text>
            <Pressable
              onPress={handleEndSession}
              disabled={isEnding}
              className="py-3 rounded-xl bg-red-500 items-center mb-2"
            >
              <Text className="text-white font-semibold text-base">
                {isEnding ? "Ending session…" : "End Session"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowConfirm(false)}
              disabled={isEnding}
              className="py-3 rounded-xl bg-gray-100 items-center"
            >
              <Text className="text-gray-700 font-semibold text-base">
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        {title}
      </Text>
      <View
        className="rounded-2xl border border-gray-200"
        style={{ overflow: "hidden" }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
      <Text className="text-base text-gray-600">{label}</Text>
      <View className="flex-row items-center gap-2">
        {icon}
        <Text
          className="text-base font-semibold text-black"
          style={mono ? { fontFamily: "monospace", fontSize: 12 } : undefined}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}
