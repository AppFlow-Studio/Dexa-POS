import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { createSupabaseClient } from "@/lib/supabase";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { SelectedStation, Station } from "@/types/station";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Monitor, RefreshCw, User, Wifi, WifiOff } from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface StationSelectItemProps {
  station: Station;
  isSelected: boolean;
  onPress: () => void;
  onTakeOver: () => void;
}

const StationSelectItem = ({
  station,
  isSelected,
  onPress,
  onTakeOver,
}: StationSelectItemProps) => {
  const isAvailable = station.is_available;
  return (
    <TouchableOpacity
      onPress={isAvailable ? onPress : undefined}
      activeOpacity={isAvailable ? 0.7 : 1}
      className={`p-4 border rounded-lg mb-3 ${
        isSelected
          ? "border-blue-500 bg-blue-900/30"
          : isAvailable
          ? "border-gray-700 bg-[#303030]"
          : "border-gray-700 bg-[#252525]"
      }`}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1">
          <View
            className={`w-12 h-12 rounded-lg items-center justify-center mr-4 ${
              isAvailable ? "bg-green-600/20" : "bg-amber-600/20"
            }`}
          >
            <Monitor
              size={24}
              color={isAvailable ? "#4ade80" : "#fbbf24"}
            />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center">
              <Text
                className={`text-xl font-medium ${
                  isSelected
                    ? "text-blue-400"
                    : isAvailable
                    ? "text-white"
                    : "text-gray-400"
                }`}
              >
                {station.station_name}
              </Text>
              {station.station_number > 0 && (
                <View className="ml-2 px-2 py-0.5 bg-gray-600 rounded">
                  <Text className="text-xs text-gray-300">
                    #{station.station_number}
                  </Text>
                </View>
              )}
            </View>
            <Text
              className={`text-sm mt-1 ${
                isSelected ? "text-blue-300" : "text-gray-400"
              }`}
            >
              {station.station_type.charAt(0).toUpperCase() +
                station.station_type.slice(1)}
            </Text>
            {!isAvailable && station.current_session && (
              <View className="flex-row items-center mt-2">
                <User size={14} color="#9ca3af" />
                <Text className="text-gray-400 text-sm ml-1">
                  In use by {station.current_session.staff_name}
                  {station.current_session.device_name &&
                    ` on ${station.current_session.device_name}`}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View className="items-end">
          {isAvailable ? (
            <View className="flex-row items-center">
              <Wifi size={16} color="#4ade80" />
              <Text className="text-green-400 text-sm ml-1">Available</Text>
            </View>
          ) : (
            <View>
              <View className="flex-row items-center mb-2">
                <WifiOff size={16} color="#fbbf24" />
                <Text className="text-amber-400 text-sm ml-1">In Use</Text>
              </View>
              <TouchableOpacity
                onPress={onTakeOver}
                className="bg-amber-600 px-3 py-1.5 rounded"
              >
                <Text className="text-white text-sm font-medium">Take Over</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const StationSelectScreen = () => {
  const router = useRouter();
  const { getToken } = useAuth();
  const supabase = createSupabaseClient(getToken);
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const setSelectedStation = useStoreSettingsStore(
    (state) => state.setSelectedStation
  );

  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    null
  );
  const [showTakeoverConfirm, setShowTakeoverConfirm] = useState(false);
  const [stationToTakeover, setStationToTakeover] = useState<Station | null>(
    null
  );

  // Fetch stations with React Query
  const {
    data: stations,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["stations", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return [];

      const { data, error } = await supabase.rpc(
        "get_location_stations_with_status",
        {
          p_location_id: selectedStore.id,
        }
      );

      if (error) throw error;
      return (data as Station[]) || [];
    },
    enabled: !!selectedStore?.id,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute for fresh status
  });

  const handleSelectStation = (station: Station) => {
    if (station.is_available) {
      setSelectedStationId(station.id);
    }
  };

  const handleTakeOverPress = (station: Station) => {
    setStationToTakeover(station);
    setShowTakeoverConfirm(true);
  };

  const handleContinue = () => {
    const station = stations?.find((s) => s.id === selectedStationId);
    if (station) {
      const stationData: SelectedStation = {
        id: station.id,
        station_name: station.station_name,
        station_type: station.station_type,
        station_number: station.station_number,
        // Phase 1 Foundation: Include view_scope and capabilities for station-based order management
        view_scope: station.view_scope,
        can_create_orders: station.can_create_orders,
        can_process_payments: station.can_process_payments,
        can_void_orders: station.can_void_orders,
        can_apply_discounts: station.can_apply_discounts,
        can_update_kitchen_status: station.can_update_kitchen_status,
        // Payment terminal metadata (non-sensitive: tpn, register_id)
        payment_terminal: station.payment_terminal || null,
      };
      setSelectedStation(stationData);
      router.push({
        pathname: "/pin-login",
        params: { forceTakeover: "false" },
      });
    }
  };

  const handleTakeoverConfirm = () => {
    if (stationToTakeover) {
      const stationData: SelectedStation = {
        id: stationToTakeover.id,
        station_name: stationToTakeover.station_name,
        station_type: stationToTakeover.station_type,
        station_number: stationToTakeover.station_number,
        // Phase 1 Foundation: Include view_scope and capabilities for station-based order management
        view_scope: stationToTakeover.view_scope,
        can_create_orders: stationToTakeover.can_create_orders,
        can_process_payments: stationToTakeover.can_process_payments,
        can_void_orders: stationToTakeover.can_void_orders,
        can_apply_discounts: stationToTakeover.can_apply_discounts,
        can_update_kitchen_status: stationToTakeover.can_update_kitchen_status,
        // Payment terminal metadata (non-sensitive: tpn, register_id)
        payment_terminal: stationToTakeover.payment_terminal || null,
      };
      setSelectedStation(stationData);
      setShowTakeoverConfirm(false);
      router.push({
        pathname: "/pin-login",
        params: { forceTakeover: "true" },
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <View className="w-full items-center justify-center py-20">
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text className="text-gray-400 mt-4">Loading stations...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View className="w-full items-center justify-center py-20">
        <Text className="text-red-400 text-lg text-center">
          Failed to load stations
        </Text>
        <Text className="text-gray-400 mt-2 text-center">
          {(error as Error).message || "Please try again later"}
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          className="mt-4 bg-blue-600 px-4 py-2 rounded-lg"
        >
          <Text className="text-white font-medium">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // No stations state
  if (!stations || stations.length === 0) {
    return (
      <View className="w-full items-center justify-center py-20">
        <Monitor size={48} color="#6b7280" />
        <Text className="text-gray-400 text-lg text-center mt-4">
          No stations available
        </Text>
        <Text className="text-gray-500 mt-2 text-center">
          Contact your administrator to set up stations
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          className="mt-4 bg-blue-600 px-4 py-2 rounded-lg"
        >
          <Text className="text-white font-medium">Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="w-full">
      <View className="flex-row items-center justify-between mb-6">
        <Text className="text-3xl font-semibold text-white text-center flex-1">
          Select Station
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          disabled={isRefetching}
          className="p-2"
        >
          <RefreshCw
            size={24}
            color={isRefetching ? "#6b7280" : "#3b82f6"}
            style={isRefetching ? { opacity: 0.5 } : undefined}
          />
        </TouchableOpacity>
      </View>

      <Text className="text-gray-400 text-center mb-4">
        {selectedStore?.name || "Unknown Location"}
      </Text>

      <ScrollView className="h-80 mb-6">
        {stations.map((station) => (
          <StationSelectItem
            key={station.id}
            station={station}
            isSelected={selectedStationId === station.id}
            onPress={() => handleSelectStation(station)}
            onTakeOver={() => handleTakeOverPress(station)}
          />
        ))}
      </ScrollView>

      <TouchableOpacity
        onPress={handleContinue}
        disabled={!selectedStationId}
        className={`w-full p-4 rounded-xl items-center ${
          selectedStationId ? "bg-blue-600" : "bg-blue-600/50"
        }`}
      >
        <Text className="text-white text-xl font-bold">Continue</Text>
      </TouchableOpacity>

      <ConfirmationModal
        isOpen={showTakeoverConfirm}
        onClose={() => setShowTakeoverConfirm(false)}
        onConfirm={handleTakeoverConfirm}
        title="Take Over Station?"
        description={
          stationToTakeover?.current_session
            ? `This station is currently being used by ${stationToTakeover.current_session.staff_name}. Taking over will end their session.`
            : "Are you sure you want to take over this station?"
        }
        confirmText="Take Over"
        variant="destructive"
      />
    </View>
  );
};

export default StationSelectScreen;
