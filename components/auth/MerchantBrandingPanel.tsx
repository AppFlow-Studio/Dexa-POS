import DeactivateTerminalModal from "@/components/auth/DeactivateTerminalModal";
import { useTriggerPosSync } from "@/hooks/pos/usePosSync";
import { useLiveClock } from "@/hooks/useLiveClock";
import { useWeather } from "@/hooks/useWeather";
import { images } from "@/lib/image";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { toastService } from "@/lib/toastService";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { Cloud, MapPin, Monitor, Power, RefreshCw } from "lucide-react-native";
import { useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

const MerchantBrandingPanel = () => {
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const organizationLogoUrl = useStoreSettingsStore(
    (s) => s.organizationLogoUrl,
  );

  const { time, date } = useLiveClock(selectedStore?.timezone);
  const weather = useWeather(selectedStore?.city, selectedStore?.state);
  const triggerPosSync = useTriggerPosSync();

  const showOrgLogo = organizationLogoUrl && !logoError;

  const handleRefresh = async () => {
    if (!selectedStore || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await triggerPosSync(selectedStore.id, selectedStore.merchant_id);
      toastService.show({
        title: "Sync Triggered",
        message: "POS data is refreshing.",
        type: "success",
      });
    } catch {
      toastService.show({
        title: "Sync Failed",
        message: "Unable to refresh data.",
        type: "error",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        height: "100%",
        borderRadius: s(16),
        backgroundColor: colors.panel,
        borderWidth: 1,
        borderColor: colors.border,
        padding: s(24),
        justifyContent: "space-between",
      }}
    >
      {/* Top: Logo + Store Name */}
      <View style={{ alignItems: "center", gap: s(10) }}>
        {showOrgLogo ? (
          <Image
            source={{ uri: organizationLogoUrl }}
            style={{ width: s(64), height: s(64), borderRadius: s(12) }}
            resizeMode="contain"
            onError={() => setLogoError(true)}
          />
        ) : (
          <Image
            source={images.dexalogo}
            style={{ width: s(64), height: s(64), borderRadius: s(12) }}
            resizeMode="contain"
          />
        )}
        {selectedStore && (
          <Text
            style={{
              fontSize: s(16),
              fontWeight: "700",
              color: colors.heading,
              textAlign: "center",
            }}
          >
            {selectedStore.name}
          </Text>
        )}
      </View>

      {/* Middle: Clock, Location, Station, Weather */}
      <View style={{ alignItems: "center", gap: s(16) }}>
        {/* Live Clock */}
        <View style={{ alignItems: "center" }}>
          <Text
            style={{
              fontSize: s(48),
              fontWeight: "200",
              color: colors.heading,
              letterSpacing: 2,
            }}
          >
            {time}
          </Text>
          <Text style={{ fontSize: s(12), color: colors.label, marginTop: s(2) }}>
            {date}
          </Text>
        </View>

        {/* Divider */}
        <View
          style={{
            width: "60%",
            height: 1,
            backgroundColor: colors.border,
          }}
        />

        {/* Location */}
        {selectedStore && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(2),
              paddingHorizontal: s(8),
            }}
          >
            <MapPin size={s(13)} color={colors.muted} />
            <Text
              style={{
                fontSize: s(11),
                color: colors.muted,
                lineHeight: s(16),
              }}
            >
              {selectedStore.address_line1}
              {selectedStore.address_line2
                ? `, ${selectedStore.address_line2}`
                : ""}
              {" \u2022 "}
              {selectedStore.city}, {selectedStore.state}{" "}
              {selectedStore.postal_code}
            </Text>
          </View>
        )}

        {/* Station badge */}
        {selectedStation && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(6),
              backgroundColor: colors.teal + "15",
              borderWidth: 1,
              borderColor: colors.teal + "40",
              borderRadius: s(20),
              paddingHorizontal: s(12),
              paddingVertical: s(5),
            }}
          >
            <Monitor size={s(13)} color={colors.teal} />
            <Text
              style={{ fontSize: s(12), fontWeight: "600", color: colors.teal }}
            >
              {selectedStation.station_name}
              {selectedStation.station_number > 0
                ? ` #${selectedStation.station_number}`
                : ""}
            </Text>
          </View>
        )}

        {/* Weather */}
        {weather && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
            <Cloud size={s(13)} color={colors.muted} />
            <Text style={{ fontSize: s(11), color: colors.muted }}>
              {weather.temperature}&deg;F &bull; {weather.description}
            </Text>
          </View>
        )}
      </View>

      {/* Bottom: Actions */}
      <View style={{ gap: s(8) }}>
        <TouchableOpacity
          onPress={handleRefresh}
          disabled={isRefreshing}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: s(6),
            paddingVertical: s(10),
            backgroundColor: colors.teal + "15",
            borderWidth: 1,
            borderColor: colors.teal + "40",
            borderRadius: s(10),
            opacity: isRefreshing ? 0.5 : 1,
          }}
        >
          <RefreshCw size={s(14)} color={colors.teal} />
          <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.teal }}>
            {isRefreshing ? "Refreshing..." : "Refresh Data"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setDeactivateModalOpen(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: s(6),
            paddingVertical: s(10),
            backgroundColor: colors.danger + "15",
            borderWidth: 1,
            borderColor: colors.danger + "30",
            borderRadius: s(10),
          }}
        >
          <Power size={s(14)} color={colors.danger} />
          <Text
            style={{ fontSize: s(12), fontWeight: "600", color: colors.danger }}
          >
            Deactivate Terminal
          </Text>
        </TouchableOpacity>
      </View>

      <DeactivateTerminalModal
        isOpen={deactivateModalOpen}
        onClose={() => setDeactivateModalOpen(false)}
      />
    </View>
  );
};

export default MerchantBrandingPanel;
