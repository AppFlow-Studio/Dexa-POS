import SessionLogoutModal from "@/components/auth/SessionLogoutModal";
import { useSessionKick } from "@/contexts/SessionKickListenerProvider";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getDeviceId } from "@/lib/deviceId";
import { secureStorage } from "@/lib/storage";
import { toastService } from "@/lib/toastService";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { clearLocationData, clearStationData } from "@/services/cacheService";
import { PosStaffLogoutResponse } from "@/types/station";
import { useClerk } from "@clerk/clerk-expo";
import { replaceRoute } from "@/lib/rootNavigation";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, TouchableOpacity, ViewStyle } from "react-native";

interface SessionLogoutButtonProps {
  style?: ViewStyle;
}

export const SessionLogoutButton = ({ style }: SessionLogoutButtonProps) => {
  const { signOut } = useClerk();
  const router = useRouter();
  const supabase = useSupabaseClient();

  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const selectedStation = useStoreSettingsStore(
    (state) => state.selectedStation
  );
  const stationSessionId = useStoreSettingsStore(
    (state) => state.stationSessionId
  );
  const clearSelectedStore = useStoreSettingsStore(
    (state) => state.clearSelectedStore
  );
  const clearStationSession = useStoreSettingsStore(
    (state) => state.clearStationSession
  );
  const { markVoluntaryLogout } = useSessionKick();
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Helper to call pos_staff_logout RPC
  const endStationSessionOnServer = async (
    clockOut: boolean = false,
    pinCode?: string
  ) => {
    if (!stationSessionId || !selectedStore) return;

    console.log("🚨 CALLING pos_staff_logout!", {
      stationSessionId,
      clockOut,
      stack: new Error().stack,
    });

    try {
      const { data, error } = await supabase.rpc("pos_staff_logout", {
        p_session_id: stationSessionId,
        p_location_id: selectedStore.id,
        p_pin_code: pinCode || "",
        p_device_id: getDeviceId(),
        p_clock_out: clockOut,
      });

      if (error) throw error;
      return data as PosStaffLogoutResponse;
    } catch (error) {
      console.error("Error ending station session:", error);
      // Don't block logout on server error - clear local state anyway
    }
  };

  const handleEndStationSession = async () => {
    setIsLoading(true);
    markVoluntaryLogout();
    try {
      // End session on server (don't clock out)
      await endStationSessionOnServer(false);

      // Clear station operational data but keep employees (location-scoped)
      clearStationSession();
      clearStationData();

      toastService.show({
        title: "Session Ended",
        message: "Station session has been ended.",
        type: "success",
      });

      setShowModal(false);

      // Navigate to station select
      replaceRoute('(auth)', 'station-select');
    } catch (error) {
      console.error("Error ending station session:", error);
      toastService.show({
        title: "Error",
        message: "Failed to end session. Please try again.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFullLogout = async () => {
    setIsLoading(true);
    markVoluntaryLogout();
    try {
      // End session on server (don't clock out - they can clock out separately)
      await endStationSessionOnServer(false);

      // Clear all local state including location-specific data
      clearStationSession();
      clearSelectedStore();
      clearLocationData();

      // Sign out of Clerk
      secureStorage.remove('clerk_was_signed_in');
      await signOut();

      setShowModal(false);

      // Navigate to login
      replaceRoute('(auth)', 'login');
    } catch (error) {
      console.error("Error during full logout:", error);
      toastService.show({
        title: "Error",
        message: "Failed to logout completely. Please try again.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setShowModal(true)}
        style={style}
        className="px-4 py-2 bg-red-500 rounded-lg items-center justify-center"
      >
        <Text className="text-white font-semibold text-lg">Log Out</Text>
      </TouchableOpacity>

      <SessionLogoutModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onEndStationSession={handleEndStationSession}
        onFullLogout={handleFullLogout}
        isLoading={isLoading}
        stationName={selectedStation?.station_name}
      />
    </>
  );
};

export default SessionLogoutButton;
