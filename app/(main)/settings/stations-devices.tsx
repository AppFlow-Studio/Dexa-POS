import { CFDPairingQR } from "@/components/cfd/CFDPairingQR";
import { CFDStatusBadge } from "@/components/cfd/CFDStatusBadge";
import { createSupabaseClient } from "@/lib/supabase";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { Station } from "@/types/station";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Cpu,
  Monitor,
  Printer,
  RefreshCw,
  Shield,
  Smartphone,
  User,
  Wifi,
  WifiOff,
} from "lucide-react-native";
import { colors, spinnerColor } from "@/lib/theme";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const StationsDevicesScreen = () => {
  const { getToken } = useAuth();
  const supabase = createSupabaseClient(getToken);
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const [showPairing, setShowPairing] = useState(false)

  const [expandedSections, setExpandedSections] = useState({
    stations: true,
    terminals: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Fetch stations with payment terminal data
  const {
    data: stations,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["stations-with-terminals", selectedStore?.id],
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
    staleTime: 30000,
    refetchInterval: 30000,
  });

  const renderSectionHeader = (
    icon: React.ReactNode,
    title: string,
    subtitle: string,
    sectionKey: keyof typeof expandedSections
  ) => {
    const isExpanded = expandedSections[sectionKey];
    return (
      <TouchableOpacity
        onPress={() => toggleSection(sectionKey)}
        className="bg-surface p-4 rounded-t-xl border-b border-gray-700 flex-row items-center justify-between"
      >
        <View className="flex-row items-center flex-1">
          <View className="w-10 h-10 bg-card rounded-lg items-center justify-center mr-3">
            {icon}
          </View>
          <View className="flex-1">
            <Text className="text-white font-bold text-lg">{title}</Text>
            <Text className="text-gray-400 text-sm mt-0.5">{subtitle}</Text>
          </View>
        </View>
        {isExpanded ? (
          <ChevronUp size={24} color={colors.label} />
        ) : (
          <ChevronDown size={24} color={colors.label} />
        )}
      </TouchableOpacity>
    );
  };

  const renderCapabilityBadge = (
    label: string,
    enabled?: boolean,
    color: string = "blue"
  ) => {
    if (enabled === undefined) return null;

    const bgColor =
      color === "blue"
        ? enabled
          ? "bg-blue-600/20"
          : "bg-gray-600/20"
        : enabled
        ? "bg-green-600/20"
        : "bg-gray-600/20";
    const textColor =
      color === "blue"
        ? enabled
          ? "text-blue-400"
          : "text-gray-500"
        : enabled
        ? "text-green-400"
        : "text-gray-500";

    return (
      <View className={`px-2 py-1 rounded ${bgColor}`}>
        <Text className={`text-xs font-medium ${textColor}`}>{label}</Text>
      </View>
    );
  };

  const renderStationCard = (station: Station) => {
    const isOnline = station.is_online;
    const isAvailable = station.is_available;

    return (
      <View
        key={station.id}
        className="bg-surface p-4 rounded-xl border border-gray-600 mb-3"
      >
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center flex-1">
            <View
              className={`w-12 h-12 rounded-lg items-center justify-center mr-3 ${
                isAvailable ? "bg-green-600/20" : "bg-amber-600/20"
              }`}
            >
              <Monitor
                size={24}
                color={isAvailable ? colors.success : colors.warning}
              />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center">
                <Text className="text-xl font-medium text-white">
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
              <Text className="text-sm text-gray-400 mt-1">
                {station.station_type.charAt(0).toUpperCase() +
                  station.station_type.slice(1)}
              </Text>
            </View>
          </View>
          <View className="items-end">
            <View className="flex-row items-center mb-1">
              {isOnline ? (
                <Wifi size={16} color={colors.success} />
              ) : (
                <WifiOff size={16} color={colors.muted} />
              )}
              <Text
                className={`text-sm ml-1 ${
                  isOnline ? "text-green-400" : "text-gray-500"
                }`}
              >
                {isOnline ? "Online" : "Offline"}
              </Text>
            </View>
            <View className="flex-row items-center">
              {isAvailable ? (
                <CheckCircle2 size={16} color={colors.success} />
              ) : (
                <AlertCircle size={16} color={colors.warning} />
              )}
              <Text
                className={`text-sm ml-1 ${
                  isAvailable ? "text-green-400" : "text-amber-400"
                }`}
              >
                {isAvailable ? "Available" : "In Use"}
              </Text>
            </View>
          </View>
        </View>

        {!isAvailable && station.current_session && (
          <View className="flex-row items-center mb-3 p-2 bg-surface rounded-lg">
            <User size={14} color={colors.label} />
            <Text className="text-gray-400 text-sm ml-2">
              In use by {station.current_session.staff_name}
              {station.current_session.device_name &&
                ` on ${station.current_session.device_name}`}
            </Text>
          </View>
        )}

        <View className="border-t border-gray-700 pt-3 mb-3">
          <Text className="text-gray-400 text-sm font-medium mb-2">
            View Scope
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <View
              className={`px-3 py-1.5 rounded-lg ${
                station.view_scope === "own"
                  ? "bg-purple-600/20"
                  : station.view_scope === "location"
                  ? "bg-blue-600/20"
                  : "bg-green-600/20"
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  station.view_scope === "own"
                    ? "text-purple-400"
                    : station.view_scope === "location"
                    ? "text-blue-400"
                    : "text-green-400"
                }`}
              >
                {station.view_scope === "own"
                  ? "Own Orders Only"
                  : station.view_scope === "location"
                  ? "All Location Orders"
                  : "Online Orders"}
              </Text>
            </View>
          </View>
        </View>

        <View className="border-t border-gray-700 pt-3 mb-3">
          <Text className="text-gray-400 text-sm font-medium mb-2">
            Capabilities
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {renderCapabilityBadge(
              "Create Orders",
              station.can_create_orders,
              "green"
            )}
            {renderCapabilityBadge(
              "Process Payments",
              station.can_process_payments,
              "green"
            )}
            {renderCapabilityBadge(
              "Void Orders",
              station.can_void_orders,
              "green"
            )}
            {renderCapabilityBadge(
              "Apply Discounts",
              station.can_apply_discounts,
              "green"
            )}
            {renderCapabilityBadge(
              "Update Kitchen",
              station.can_update_kitchen_status,
              "green"
            )}
          </View>
        </View>

        {/* Device Health Section */}
        {(station.device_manufacturer || station.hardware_model || station.last_heartbeat_at) && (
          <View className="border-t border-gray-700 pt-3 mb-3">
            <View className="flex-row items-center mb-2">
              <Smartphone size={16} color={colors.label} />
              <Text className="text-gray-400 text-sm font-medium ml-2">
                Device Health
              </Text>
            </View>
            <View className="bg-surface p-3 rounded-lg">
              {station.hardware_model && (
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-gray-400 text-sm">Hardware</Text>
                  <Text className="text-white text-sm">
                    {station.device_manufacturer && `${station.device_manufacturer} `}
                    {station.hardware_model || station.device_model}
                  </Text>
                </View>
              )}
              {station.last_heartbeat_at && (
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-gray-400 text-sm">Last Heartbeat</Text>
                  <Text className="text-white text-sm">
                    {formatDistanceToNow(new Date(station.last_heartbeat_at), {
                      addSuffix: true,
                    })}
                  </Text>
                </View>
              )}
              {station.network_type && (
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-gray-400 text-sm">Network</Text>
                  <View className="flex-row items-center">
                    <Wifi size={12} color={colors.label} />
                    <Text className="text-white text-sm ml-1">
                      {station.network_type}
                    </Text>
                  </View>
                </View>
              )}
              {station.app_version && (
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-gray-400 text-sm">App Version</Text>
                  <Text className="text-white text-sm">v{station.app_version}</Text>
                </View>
              )}
              {/* Hardware capability badges */}
              <View className="flex-row flex-wrap gap-2 mt-1">
                {station.has_builtin_printer && (
                  <View className="px-2 py-1 rounded bg-emerald-600/20 flex-row items-center">
                    <Printer size={10} color={colors.success} />
                    <Text className="text-xs font-medium text-emerald-400 ml-1">Printer</Text>
                  </View>
                )}
                {station.has_builtin_cfd && (
                  <View className="px-2 py-1 rounded bg-emerald-600/20 flex-row items-center">
                    <Monitor size={10} color={colors.success} />
                    <Text className="text-xs font-medium text-emerald-400 ml-1">CFD</Text>
                  </View>
                )}
                {station.has_nfc && (
                  <View className="px-2 py-1 rounded bg-emerald-600/20 flex-row items-center">
                    <Cpu size={10} color={colors.success} />
                    <Text className="text-xs font-medium text-emerald-400 ml-1">NFC</Text>
                  </View>
                )}
                {station.has_cash_drawer_port && (
                  <View className="px-2 py-1 rounded bg-emerald-600/20 flex-row items-center">
                    <CreditCard size={10} color={colors.success} />
                    <Text className="text-xs font-medium text-emerald-400 ml-1">Cash Drawer</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {station.payment_terminal && (
          <View className="border-t border-gray-700 pt-3">
            <View className="flex-row items-center mb-2">
              <CreditCard size={16} color={colors.label} />
              <Text className="text-gray-400 text-sm font-medium ml-2">
                Linked Payment Terminal
              </Text>
            </View>
            <View className="bg-surface p-3 rounded-lg">
              <Text className="text-white font-medium">
                {station.payment_terminal.terminal_name}
              </Text>
              <View className="flex-row items-center mt-1">
                {station.payment_terminal.register_id && (
                  <Text className="text-gray-400 text-sm">
                    Register: {station.payment_terminal.register_id}
                  </Text>
                )}
              </View>
              <View className="flex-row items-center mt-2">
                {station.payment_terminal.is_connected ? (
                  <>
                    <CheckCircle2 size={14} color={colors.success} />
                    <Text className="text-green-400 text-xs ml-1">
                      Connected
                    </Text>
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} color={colors.danger} />
                    <Text className="text-red-400 text-xs ml-1">
                      Disconnected
                    </Text>
                  </>
                )}
                {station.payment_terminal.last_connection_test_at && (
                  <Text className="text-gray-500 text-xs ml-2">
                    Last test:{" "}
                    {formatDistanceToNow(
                      new Date(
                        station.payment_terminal.last_connection_test_at
                      ),
                      { addSuffix: true }
                    )}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderTerminalCard = (station: Station) => {
    if (!station.payment_terminal) return null;

    const terminal = station.payment_terminal;

    return (
      <View
        key={terminal.id}
        className="bg-surface p-4 rounded-xl border border-gray-600 mb-3"
      >
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center flex-1">
            <View
              className={`w-12 h-12 rounded-lg items-center justify-center mr-3 ${
                terminal.is_connected ? "bg-green-600/20" : "bg-red-600/20"
              }`}
            >
              <CreditCard
                size={24}
                color={terminal.is_connected ? colors.success : colors.danger}
              />
            </View>
            <View className="flex-1">
              <Text className="text-xl font-medium text-white">
                {terminal.terminal_name}
              </Text>
              <Text className="text-sm text-gray-400 mt-1">
                {terminal.terminal_type.charAt(0).toUpperCase() +
                  terminal.terminal_type.slice(1)}
                {terminal.terminal_model && ` • ${terminal.terminal_model}`}
              </Text>
            </View>
          </View>
          <View className="items-end">
            {terminal.is_connected ? (
              <>
                <CheckCircle2 size={20} color={colors.success} />
                <Text className="text-green-400 text-xs mt-1">Connected</Text>
              </>
            ) : (
              <>
                <AlertCircle size={20} color={colors.danger} />
                <Text className="text-red-400 text-xs mt-1">Offline</Text>
              </>
            )}
          </View>
        </View>

        <View className="bg-surface p-3 rounded-lg mb-3">
          {terminal.register_id && (
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-gray-400 text-sm">Register ID</Text>
              <Text className="text-white font-mono">
                {terminal.register_id}
              </Text>
            </View>
          )}
          <View className="flex-row items-center justify-between">
            <Text className="text-gray-400 text-sm">Linked Station</Text>
            <Text className="text-white">{station.station_name}</Text>
          </View>
        </View>

        {terminal.last_connection_status && (
          <View className="flex-row items-center mb-3">
            <Text className="text-gray-400 text-sm">Status: </Text>
            <Text
              className={`text-sm font-medium ${
                terminal.last_connection_status === "Online"
                  ? "text-green-400"
                  : terminal.last_connection_status === "Offline"
                  ? "text-red-400"
                  : "text-gray-400"
              }`}
            >
              {terminal.last_connection_status}
            </Text>
            {terminal.last_connection_test_at && (
              <Text className="text-gray-500 text-sm ml-2">
                •{" "}
                {formatDistanceToNow(
                  new Date(terminal.last_connection_test_at),
                  { addSuffix: true }
                )}
              </Text>
            )}
          </View>
        )}

        <View className="bg-blue-600/10 border border-blue-600/30 p-3 rounded-lg flex-row items-center">
          <Shield size={16} color={colors.info} />
          <Text className="text-blue-400 text-xs ml-2 flex-1">
            Auth credentials encrypted and accessed securely during payment
            processing
          </Text>
        </View>
      </View>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <ScrollView className="flex-1 bg-screen p-6">
        <View className="w-full items-center justify-center py-20">
          <ActivityIndicator size="large" color={colors.info} />
          <Text className="text-gray-400 mt-4">Loading stations...</Text>
        </View>
      </ScrollView>
    );
  }

  // Error state
  if (error) {
    return (
      <ScrollView className="flex-1 bg-screen p-6">
        <View className="w-full items-center justify-center py-20">
          <AlertCircle size={48} color={colors.danger} />
          <Text className="text-red-400 text-lg text-center mt-4">
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
      </ScrollView>
    );
  }

  return (
    <ScrollView className="flex-1 bg-screen p-6">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-6">
        <View className="flex-1">
          <Text className="text-3xl font-bold text-white">
            Stations & Devices
          </Text>
          <Text className="text-gray-400 mt-2">
            View stations, capabilities, and linked payment terminals
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => refetch()}
          disabled={isRefetching}
          className={`ml-4 p-3 rounded-lg ${
            isRefetching ? "bg-gray-700" : "bg-blue-600"
          }`}
        >
          <RefreshCw
            size={20}
            color="white"
            style={isRefetching ? { opacity: 0.5 } : undefined}
          />
        </TouchableOpacity>
      </View>

      <View className="h-px w-full bg-gray-700 mb-6" />

      {/* No stations state */}
      {!stations || stations.length === 0 ? (
        <View className="w-full items-center justify-center py-20">
          <Monitor size={48} color={colors.muted} />
          <Text className="text-gray-400 text-lg text-center mt-4">
            No stations available
          </Text>
          <Text className="text-gray-500 mt-2 text-center">
            Contact your administrator to set up stations
          </Text>
        </View>
      ) : (
        <>
          {/* Stations Section */}
          <View className="bg-panel rounded-xl border border-gray-700 mb-6">
            {renderSectionHeader(
              <Monitor size={20} color={colors.info} />,
              "Stations",
              `${stations.length} station${stations.length !== 1 ? "s" : ""} configured`,
              "stations"
            )}
            {expandedSections.stations && (
              <View className="p-4">
                {stations.map((station) => renderStationCard(station))}
              </View>
            )}
          </View>

          {/* Payment Terminals Section */}
          {stations.some((s) => s.payment_terminal) && (
            <View className="bg-panel rounded-xl border border-gray-700 mb-6">
              {renderSectionHeader(
                <CreditCard size={20} color={colors.success} />,
                "Payment Terminals",
                `${stations.filter((s) => s.payment_terminal).length} terminal${
                  stations.filter((s) => s.payment_terminal).length !== 1
                    ? "s"
                    : ""
                } linked`,
                "terminals"
              )}
              {expandedSections.terminals && (
                <View className="p-4">
                  {stations
                    .filter((s) => s.payment_terminal)
                    .map((station) => renderTerminalCard(station))}
                </View>
              )}
            </View>
          )}

          {/* CFD Section */}
      <View className="bg-neutral-900 rounded-xl p-4 mt-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <Monitor size={24} color={colors.label} />
            <View>
              <Text className="text-white text-lg font-semibold">
                Customer Display
              </Text>
              <Text className="text-neutral-500 text-sm">
                Show order details to customers
              </Text>
            </View>
          </View>
          
          <CFDStatusBadge onPress={() => setShowPairing(true)} />
        </View>

        <Pressable
          onPress={() => setShowPairing(true)}
          className="bg-emerald-600 mt-4 py-3 rounded-lg items-center"
        >
          <Text className="text-white font-semibold">Connect Display</Text>
        </Pressable>
      </View>

      {/* Pairing Modal */}
      <Modal
        visible={showPairing}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPairing(false)}
      >
        <View className="flex-1 bg-black/80 justify-center items-center p-4">
          <CFDPairingQR onClose={() => setShowPairing(false)} />
        </View>
      </Modal>

          {/* Security Notice */}
          <View className="bg-gray-800/50 border border-gray-700 p-4 rounded-xl">
            <View className="flex-row items-start">
              <Shield size={20} color={colors.info} className="mr-3 mt-0.5" />
              <View className="flex-1">
                <Text className="text-blue-400 font-medium mb-1">
                  Security & Encryption
                </Text>
                <Text className="text-gray-400 text-sm leading-5">
                  All payment terminal auth keys are encrypted in the database
                  using PGP encryption and are only decrypted in memory during
                  payment processing. Credentials are never stored persistently
                  on devices.
                </Text>
              </View>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
};

export default StationsDevicesScreen;
