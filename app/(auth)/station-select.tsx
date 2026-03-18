import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { createSupabaseClient } from "@/lib/supabase";
import { colors, spinnerColor } from "@/lib/theme";
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
      style={{
        backgroundColor: isSelected ? colors.teal + "10" : colors.card,
        borderWidth: 1,
        borderColor: isSelected
          ? colors.teal + "50"
          : isAvailable
            ? colors.border
            : colors.border,
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginBottom: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        {/* Left: icon + info */}
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isSelected
                ? colors.teal + "20"
                : isAvailable
                  ? colors.success + "15"
                  : colors.warning + "15",
              marginRight: 12,
            }}
          >
            <Monitor
              size={16}
              color={isSelected ? colors.teal : isAvailable ? colors.success : colors.warning}
            />
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: isSelected ? colors.teal : isAvailable ? colors.heading : colors.label,
                }}
              >
                {station.station_name}
              </Text>
              {station.station_number > 0 && (
                <View
                  style={{
                    backgroundColor: colors.screen,
                    borderRadius: 20,
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "600", color: colors.muted }}>
                    #{station.station_number}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
              {station.station_type.charAt(0).toUpperCase() + station.station_type.slice(1)}
            </Text>
            {!isAvailable && station.current_session && (
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 }}>
                <User size={11} color={colors.muted} />
                <Text style={{ fontSize: 11, color: colors.muted }}>
                  {station.current_session.staff_name}
                  {station.current_session.device_name
                    ? ` · ${station.current_session.device_name}`
                    : ""}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Right: status / action */}
        <View style={{ alignItems: "flex-end" }}>
          {isAvailable ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: colors.success + "15",
                borderRadius: 20,
                paddingHorizontal: 9,
                paddingVertical: 3,
                borderWidth: 1,
                borderColor: colors.success + "40",
              }}
            >
              <Wifi size={11} color={colors.success} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.success }}>
                Available
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: colors.warning + "15",
                  borderRadius: 20,
                  paddingHorizontal: 9,
                  paddingVertical: 3,
                  borderWidth: 1,
                  borderColor: colors.warning + "40",
                }}
              >
                <WifiOff size={11} color={colors.warning} />
                <Text style={{ fontSize: 11, fontWeight: "600", color: colors.warning }}>
                  In Use
                </Text>
              </View>
              <TouchableOpacity
                onPress={onTakeOver}
                style={{
                  backgroundColor: colors.warning + "15",
                  borderWidth: 1,
                  borderColor: colors.warning + "40",
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "600", color: colors.warning }}>
                  Take Over
                </Text>
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

  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [showTakeoverConfirm, setShowTakeoverConfirm] = useState(false);
  const [stationToTakeover, setStationToTakeover] = useState<Station | null>(null);

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
        { p_location_id: selectedStore.id }
      );
      if (error) throw error;
      return (data as Station[]) || [];
    },
    enabled: !!selectedStore?.id,
    staleTime: 30000,
    refetchInterval: 60000,
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
        view_scope: station.view_scope,
        can_create_orders: station.can_create_orders,
        can_process_payments: station.can_process_payments,
        can_void_orders: station.can_void_orders,
        can_apply_discounts: station.can_apply_discounts,
        can_update_kitchen_status: station.can_update_kitchen_status,
        payment_terminal: station.payment_terminal || null,
      };
      setSelectedStation(stationData);
      router.push({ pathname: "/pin-login", params: { forceTakeover: "false" } });
    }
  };

  const handleTakeoverConfirm = () => {
    if (stationToTakeover) {
      const stationData: SelectedStation = {
        id: stationToTakeover.id,
        station_name: stationToTakeover.station_name,
        station_type: stationToTakeover.station_type,
        station_number: stationToTakeover.station_number,
        view_scope: stationToTakeover.view_scope,
        can_create_orders: stationToTakeover.can_create_orders,
        can_process_payments: stationToTakeover.can_process_payments,
        can_void_orders: stationToTakeover.can_void_orders,
        can_apply_discounts: stationToTakeover.can_apply_discounts,
        can_update_kitchen_status: stationToTakeover.can_update_kitchen_status,
        payment_terminal: stationToTakeover.payment_terminal || null,
      };
      setSelectedStation(stationData);
      setShowTakeoverConfirm(false);
      router.push({ pathname: "/pin-login", params: { forceTakeover: "true" } });
    }
  };

  if (isLoading) {
    return (
      <View style={{ width: "100%", alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
        <ActivityIndicator size="small" color={spinnerColor} />
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 10 }}>Loading stations...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ width: "100%", alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.danger, textAlign: "center" }}>
          Failed to load stations
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
          {(error as Error).message || "Please try again later"}
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={{
            marginTop: 4,
            backgroundColor: colors.teal + "20",
            borderWidth: 1,
            borderColor: colors.teal + "50",
            borderRadius: 8,
            paddingHorizontal: 14,
            paddingVertical: 6,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!stations || stations.length === 0) {
    return (
      <View style={{ width: "100%", alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 8 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: colors.teal + "15",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Monitor size={20} color={colors.muted} />
        </View>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.label, textAlign: "center" }}>
          No stations available
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center" }}>
          Contact your administrator to set up stations
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={{
            marginTop: 4,
            backgroundColor: colors.teal + "20",
            borderWidth: 1,
            borderColor: colors.teal + "50",
            borderRadius: 8,
            paddingHorizontal: 14,
            paddingVertical: 6,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ width: "100%" }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading, flex: 1 }}>
          Select Station
        </Text>
        <TouchableOpacity
          onPress={() => refetch()}
          disabled={isRefetching}
          style={{
            padding: 6,
            backgroundColor: colors.teal + "10",
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.teal + "30",
            opacity: isRefetching ? 0.5 : 1,
          }}
        >
          <RefreshCw size={14} color={colors.teal} />
        </TouchableOpacity>
      </View>

      {/* Location subtitle */}
      <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 14 }}>
        {selectedStore?.name || "Unknown Location"}
      </Text>

      {/* Station list */}
      <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
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

      {/* Continue button */}
      <TouchableOpacity
        onPress={handleContinue}
        disabled={!selectedStationId}
        style={{
          marginTop: 14,
          backgroundColor: selectedStationId ? colors.teal : colors.teal + "30",
          borderRadius: 10,
          paddingVertical: 11,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: selectedStationId ? colors.onSolid : colors.muted,
          }}
        >
          Continue
        </Text>
      </TouchableOpacity>

      <ConfirmationModal
        isOpen={showTakeoverConfirm}
        onClose={() => setShowTakeoverConfirm(false)}
        onConfirm={handleTakeoverConfirm}
        title="Take Over Station?"
        description={
          stationToTakeover?.current_session
            ? `Station is used by ${stationToTakeover.current_session.staff_name}. You must enter your PIN to take over and end their session.`
            : "Station is in use. You must enter your PIN to take over."
        }
        confirmText="Proceed to PIN"
        variant="destructive"
      />
    </View>
  );
};

export default StationSelectScreen;
