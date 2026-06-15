import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { KioskConfig } from "@/types/kiosk";
import appJson from "@/app.json";
import { Wifi, WifiOff, X } from "lucide-react-native";
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
  const { isOnline, rawIsOnline, quality, pendingSyncCount } = useNetworkStatus();

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

      <ScrollView className="flex-1 px-6 py-4" contentContainerStyle={{ gap: 16 }}>
        <Section title="Connectivity">
          <Row
            label="Network"
            value={rawIsOnline ? "Online" : "Offline"}
            icon={rawIsOnline ? <Wifi size={18} color="#16A34A" /> : <WifiOff size={18} color="#DC2626" />}
          />
          <Row label="Connection quality" value={quality} />
          <Row label="Effective status" value={isOnline ? "Online" : "Degraded / Offline"} />
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
          <Row label="Cart reset timeout" value={`${config.cartResetTimeoutSeconds}s`} />
          <Row label="Payment terminal" value={config.paymentTerminalId ?? "Not linked"} mono />
          <Row label="Published" value={config.publishedAt ?? "Never"} />
          <Row label="Active" value={config.isActive ? "Yes" : "No"} />
        </Section>

        <Section title="App">
          <Row label="Version" value={appJson.expo.version} />
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        {title}
      </Text>
      <View className="rounded-2xl border border-gray-200" style={{ overflow: "hidden" }}>
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
