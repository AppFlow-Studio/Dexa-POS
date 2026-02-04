import DeactivateTerminalModal from "@/components/auth/DeactivateTerminalModal";
import { useLiveClock } from "@/hooks/useLiveClock";
import { useWeather } from "@/hooks/useWeather";
import { useTriggerPosSync } from "@/hooks/pos/usePosSync";
import { images } from "@/lib/image";
import { toastService } from "@/lib/toastService";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  Cloud,
  MapPin,
  Monitor,
  Power,
  RefreshCw,
} from "lucide-react-native";
import React, { useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

const MerchantBrandingPanel = () => {
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const organizationLogoUrl = useStoreSettingsStore(
    (s) => s.organizationLogoUrl
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
    <View className="flex-1 h-full rounded-2xl bg-[#1a1a1a] p-8 justify-between">
      {/* Top Section: Logo + Store Name */}
      <View className="items-center">
        {showOrgLogo ? (
          <Image
            source={{ uri: organizationLogoUrl }}
            className="w-28 h-28 rounded-2xl mb-4"
            resizeMode="contain"
            onError={() => setLogoError(true)}
          />
        ) : (
          <Image
            source={images.dexalogo}
            className="w-28 h-28 rounded-2xl mb-4"
            resizeMode="contain"
          />
        )}
        {selectedStore && (
          <Text className="text-white text-2xl font-bold text-center">
            {selectedStore.name}
          </Text>
        )}
      </View>

      {/* Middle Section: Clock, Location, Station, Weather */}
      <View className="items-center gap-6">
        {/* Live Clock */}
        <View className="items-center">
          <Text className="text-white text-5xl font-light tracking-wider">
            {time}
          </Text>
          <Text className="text-gray-400 text-lg mt-1">{date}</Text>
        </View>

        {/* Location */}
        {selectedStore && (
          <View className="flex-row items-center gap-2">
            <MapPin size={16} color="#9ca3af" />
            <Text className="text-gray-400 text-base">
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

        {/* Station */}
        {selectedStation && (
          <View className="flex-row items-center gap-2 bg-[#2D2D2D] px-4 py-2 rounded-lg">
            <Monitor size={16} color="#60a5fa" />
            <Text className="text-blue-400 text-base font-medium">
              {selectedStation.station_name} #{selectedStation.station_number}
            </Text>
          </View>
        )}

        {/* Weather */}
        {weather && (
          <View className="flex-row items-center gap-2">
            <Cloud size={16} color="#9ca3af" />
            <Text className="text-gray-400 text-base">
              {weather.temperature}\u00B0F \u2022 {weather.description}
            </Text>
          </View>
        )}
      </View>

      {/* Bottom Section: Actions */}
      <View className="gap-3">
        <TouchableOpacity
          onPress={handleRefresh}
          disabled={isRefreshing}
          className={`flex-row items-center justify-center gap-2 py-3 bg-blue-600/20 border border-blue-500/30 rounded-xl ${
            isRefreshing && "opacity-50"
          }`}
        >
          <RefreshCw size={18} color="#3b82f6" />
          <Text className="text-blue-400 text-base font-semibold">
            {isRefreshing ? "Refreshing..." : "Refresh Data"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setDeactivateModalOpen(true)}
          className="flex-row items-center justify-center gap-2 py-3 bg-red-600/20 border border-red-500/30 rounded-xl"
        >
          <Power size={18} color="#ef4444" />
          <Text className="text-red-400 text-base font-semibold">
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
