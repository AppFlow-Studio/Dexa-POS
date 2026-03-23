import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad from "@/components/auth/PinNumpad";
import SessionLogoutModal from "@/components/auth/SessionLogoutModal";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { FailedSyncsPanel } from "@/components/settings/sync-status/FailedSyncsPanel";
import { Switch } from "@/components/ui/switch";
import { colors, spinnerColor } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import type { MerchantRole } from "@/lib/types";
import { getDeviceId } from "@/lib/deviceId";
import { replaceRoute } from "@/lib/rootNavigation";
import { clearStationData, clearLocationData } from "@/services/cacheService";
import { syncNow } from "@/services/offlineSyncService";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useQueryClient } from "@tanstack/react-query";
import { useClerk } from "@clerk/clerk-expo";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  ListChecks,
  LogOut,
  MapPin,
  Phone,
  RefreshCw,
  ShoppingBag,
  Store,
  Sun,
  Trash2,
  UtensilsCrossed,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const MANAGER_ROLES: MerchantRole[] = [
  "merchant.manager",
  "merchant.admin",
  "merchant.owner",
];

// ─── Manager PIN Gate Modal ──────────────────────────────────────────────────

interface PinGateModalProps {
  visible: boolean;
  title: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const PinGateModal: React.FC<PinGateModalProps> = ({
  visible,
  title,
  onSuccess,
  onCancel,
}) => {
  const [pin, setPin] = useState("");
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const handleVerify = useCallback(() => {
    const employee = useEmployeeStore.getState().findEmployeeByPin(pin);
    const isManager = employee && MANAGER_ROLES.includes(employee.role);
    if (isManager) {
      setPin("");
      onSuccess();
    } else {
      shakeX.value = withSequence(
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(0, { duration: 100 })
      );
      setPin("");
      toastService.show({
        title: "Invalid PIN",
        message: employee
          ? "This employee does not have manager access."
          : "PIN does not match any employee.",
        type: "error",
      });
    }
  }, [pin, onSuccess, shakeX]);

  const handleCancel = () => {
    setPin("");
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleCancel}
        className="flex-1 bg-black/60 items-center justify-center px-6"
      >
        <TouchableOpacity activeOpacity={1} className="w-full max-w-sm">
          <View className="bg-panel border border-gray-600 rounded-2xl p-6">
            <Text className="text-center text-xl font-bold text-white mb-1">
              Manager PIN Required
            </Text>
            <Text className="text-center text-sm text-label mb-4">{title}</Text>
            <Animated.View style={shakeStyle}>
              <PinDisplay pinLength={pin.length} maxLength={4} />
              <PinNumpad
                onKeyPress={(input) => {
                  if (typeof input === "number") {
                    if (pin.length < 4) setPin(pin + input.toString());
                  } else if (input === "clear") {
                    setPin("");
                  } else if (input === "backspace") {
                    setPin(pin.slice(0, -1));
                  }
                }}
              />
            </Animated.View>
            <TouchableOpacity
              onPress={handleVerify}
              className="py-2.5 bg-blue-600 rounded-lg mt-3"
            >
              <Text className="text-center text-sm font-bold text-white">
                Verify
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCancel}
              className="py-2 mt-2"
            >
              <Text className="text-center text-sm text-label">Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

// ─── Main Screen ─────────────────────────────────────────────────────────────

const GeneralSettingsScreen = () => {
  const queryClient = useQueryClient();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);

  const showMenuImages = useSettingsStore((s) => s.showMenuImages);
  const setShowMenuImages = useSettingsStore((s) => s.setShowMenuImages);

  // ── Derived display values ──────────────────────────────────────────────
  const displayStoreName = selectedStore?.name || "No store selected";
  const displayAddress = selectedStore
    ? [
        selectedStore.address_line1,
        selectedStore.address_line2,
        selectedStore.city,
        selectedStore.state,
        selectedStore.postal_code,
      ]
        .filter(Boolean)
        .join(", ")
    : "Select a store to see address";
  const displayPhone = selectedStore?.phone || "—";

  interface DisplayHour {
    day: string;
    open: string;
    close: string;
    enabled: boolean;
  }
  const displayHours: DisplayHour[] = selectedStore?.business_hours
    ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
        (day) => {
          const key = day.toLowerCase() as keyof typeof selectedStore.business_hours;
          const h = selectedStore.business_hours[key];
          return { day, open: h?.open || "09:00", close: h?.close || "17:00", enabled: !h?.is_closed };
        }
      )
    : [];

  // ── Collapsible sections ────────────────────────────────────────────────
  const [expandedSections, setExpandedSections] = useState({
    info: true,
    hours: false,
    display: true,
    sync: true,
    cache: true,
  });
  const toggleSection = (s: keyof typeof expandedSections) =>
    setExpandedSections((prev) => ({ ...prev, [s]: !prev[s] }));

  // ── Sync actions ────────────────────────────────────────────────────────
  const [syncingKey, setSyncingKey] = useState<string | null>(null);

  const handleSyncPOS = async () => {
    setSyncingKey("pos");
    try {
      await syncNow();
      toastService.show({ title: "POS Synced", message: "All pending operations have been flushed.", type: "success" });
    } catch {
      toastService.show({ title: "Sync Failed", message: "Could not sync. Check your connection.", type: "error" });
    } finally {
      setSyncingKey(null);
    }
  };

  const handleFetchOrders = async () => {
    if (!selectedStore?.id) return;
    setSyncingKey("orders");
    try {
      await queryClient.invalidateQueries({ queryKey: ["active_orders", selectedStore.id] });
      toastService.show({ title: "Orders Refreshed", message: "Latest orders have been fetched.", type: "success" });
    } catch {
      toastService.show({ title: "Failed", message: "Could not fetch orders.", type: "error" });
    } finally {
      setSyncingKey(null);
    }
  };

  const handleFetchMenus = async () => {
    if (!selectedStore?.id) return;
    setSyncingKey("menus");
    try {
      await queryClient.invalidateQueries({ queryKey: ["pos_sync", selectedStore.id] });
      toastService.show({ title: "Menu Refreshed", message: "Latest menu data has been fetched.", type: "success" });
    } catch {
      toastService.show({ title: "Failed", message: "Could not fetch menus.", type: "error" });
    } finally {
      setSyncingKey(null);
    }
  };

  const handleFetchSettings = async () => {
    setSyncingKey("settings");
    try {
      await queryClient.invalidateQueries({ queryKey: ["pos_sync"] });
      await queryClient.invalidateQueries({ queryKey: ["standalone_sync"] });
      toastService.show({ title: "Settings Refreshed", message: "Latest POS settings have been fetched.", type: "success" });
    } catch {
      toastService.show({ title: "Failed", message: "Could not fetch settings.", type: "error" });
    } finally {
      setSyncingKey(null);
    }
  };

  // ── Clear cache (preserves user session) ───────────────────────────────
  const [showClearCacheModal, setShowClearCacheModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleClearCache = async () => {
    setIsClearing(true);
    setShowClearCacheModal(false);
    try {
      // clearStationData preserves employees and Clerk session;
      // only wipes orders, timeclock, and query cache
      clearStationData();
      toastService.show({
        title: "Cache Cleared",
        message: "Orders and local data cleared. Your session is preserved.",
        type: "success",
      });
    } catch {
      toastService.show({ title: "Error", message: "Failed to clear cache.", type: "error" });
    } finally {
      setIsClearing(false);
    }
  };

  // ── Log out — requires manager PIN ─────────────────────────────────────
  const { signOut } = useClerk();
  const supabase = useSupabaseClient();
  const stationSessionId = useStoreSettingsStore((s) => s.stationSessionId);
  const clearSelectedStore = useStoreSettingsStore((s) => s.clearSelectedStore);
  const clearStationSession = useStoreSettingsStore((s) => s.clearStationSession);

  const [showLogoutPinGate, setShowLogoutPinGate] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
      // Non-blocking — clear local state anyway
    }
  };

  const handleEndStationSession = async () => {
    setIsLoggingOut(true);
    try {
      await endStationSessionOnServer();
      clearStationSession();
      clearStationData();
      setShowLogoutModal(false);
      toastService.show({ title: "Session Ended", message: "Station session has been ended.", type: "success" });
      replaceRoute("(auth)", "station-select");
    } catch {
      toastService.show({ title: "Error", message: "Failed to end session. Please try again.", type: "error" });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleFullLogout = async () => {
    setIsLoggingOut(true);
    try {
      await endStationSessionOnServer();
      clearStationSession();
      clearSelectedStore();
      clearLocationData();
      await signOut();
      setShowLogoutModal(false);
      replaceRoute("(auth)", "login");
    } catch {
      toastService.show({ title: "Error", message: "Failed to logout. Please try again.", type: "error" });
    } finally {
      setIsLoggingOut(false);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  const renderSectionHeader = (
    title: string,
    icon: React.ReactNode,
    section: keyof typeof expandedSections,
    badge?: string
  ) => (
    <TouchableOpacity
      onPress={() => toggleSection(section)}
      className="flex-row items-center justify-between p-4 bg-surface rounded-t-xl border-b border-gray-700"
    >
      <View className="flex-row items-center gap-3">
        <View className="w-8 h-8 bg-card rounded-lg items-center justify-center">
          {icon}
        </View>
        <Text className="text-white font-bold text-lg">{title}</Text>
        {badge && (
          <View className="px-2 py-0.5 bg-blue-600/30 border border-blue-500/40 rounded-full">
            <Text className="text-xs text-blue-300">{badge}</Text>
          </View>
        )}
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={20} color={colors.label} />
      ) : (
        <ChevronDown size={20} color={colors.label} />
      )}
    </TouchableOpacity>
  );

  const renderSyncButton = (
    label: string,
    subtitle: string,
    icon: React.ReactNode,
    key: string,
    onPress: () => void
  ) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={syncingKey !== null}
      className="flex-row items-center p-3 bg-surface border border-border rounded-xl mb-2"
    >
      <View className="w-10 h-10 bg-card rounded-lg items-center justify-center mr-3">
        {syncingKey === key ? (
          <ActivityIndicator size="small" color={spinnerColor} />
        ) : (
          icon
        )}
      </View>
      <View className="flex-1">
        <Text className="text-white font-semibold text-sm">{label}</Text>
        <Text className="text-label text-xs mt-0.5">{subtitle}</Text>
      </View>
      {syncingKey !== key && (
        <RefreshCw size={16} color={colors.label} />
      )}
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-screen p-6">
      <View className="mb-6">
        <Text className="text-3xl font-bold text-white">General Settings</Text>
        <Text className="text-gray-400 mt-1">
          Business information, display preferences, and system utilities.
        </Text>
      </View>

      <View className="h-px w-full bg-gray-700 mb-6" />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Failed Sync Operations */}
        <View className="mb-6">
          <FailedSyncsPanel />
        </View>

        {/* ── Business Information (read-only) ── */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader(
            "Business Information",
            <Store size={20} color={colors.info} />,
            "info",
            "Read-only"
          )}
          {expandedSections.info && (
            <View className="p-5">
              <View className="flex-row items-center gap-2 mb-4 p-3 bg-blue-900/20 border border-blue-700/40 rounded-lg">
                <ExternalLink size={14} color="#60a5fa" />
                <Text className="text-blue-300 text-xs flex-1">
                  To update business information, visit your dashboard on the website.
                </Text>
              </View>

              {/* Business Name */}
              <View className="mb-3">
                <Text className="text-xs text-label mb-1 font-medium">Business Name</Text>
                <View className="flex-row items-center bg-surface border border-gray-700 rounded-lg px-3 py-3 gap-2">
                  <Building2 size={16} color={colors.info} />
                  <Text className="text-white text-sm flex-1">{displayStoreName}</Text>
                </View>
              </View>

              {/* Address */}
              <View className="mb-3">
                <Text className="text-xs text-label mb-1 font-medium">Address</Text>
                <View className="flex-row items-center bg-surface border border-gray-700 rounded-lg px-3 py-3 gap-2">
                  <MapPin size={16} color={colors.danger} />
                  <Text className="text-white text-sm flex-1">{displayAddress}</Text>
                </View>
              </View>

              {/* Phone */}
              <View>
                <Text className="text-xs text-label mb-1 font-medium">Phone</Text>
                <View className="flex-row items-center bg-surface border border-gray-700 rounded-lg px-3 py-3 gap-2">
                  <Phone size={16} color={colors.success} />
                  <Text className="text-white text-sm flex-1">{displayPhone}</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ── Operating Hours (read-only) ── */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader(
            "Operating Hours",
            <Clock size={20} color={colors.warning} />,
            "hours",
            "Read-only"
          )}
          {expandedSections.hours && (
            <View className="p-5">
              <View className="flex-row items-center gap-2 mb-4 p-3 bg-blue-900/20 border border-blue-700/40 rounded-lg">
                <ExternalLink size={14} color="#60a5fa" />
                <Text className="text-blue-300 text-xs flex-1">
                  To update operating hours, visit your dashboard on the website.
                </Text>
              </View>

              {displayHours.length === 0 ? (
                <Text className="text-label text-sm text-center py-2">No hours configured.</Text>
              ) : (
                displayHours.map((h) => (
                  <View
                    key={h.day}
                    className={`flex-row items-center justify-between py-2.5 border-b border-gray-700/50 ${
                      !h.enabled ? "opacity-40" : ""
                    }`}
                  >
                    <Text className="text-white font-medium w-28 text-sm">{h.day}</Text>
                    {h.enabled ? (
                      <Text className="text-label text-sm">
                        {h.open} – {h.close}
                      </Text>
                    ) : (
                      <Text className="text-gray-500 text-sm italic">Closed</Text>
                    )}
                  </View>
                ))
              )}
            </View>
          )}
        </View>

        {/* ── Display Preferences ── */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader(
            "Display",
            <Sun size={20} color="#f59e0b" />,
            "display"
          )}
          {expandedSections.display && (
            <View className="p-5 gap-1">
              {/* Show Menu Item Images */}
              <View className="flex-row items-center justify-between py-3 border-b border-gray-700">
                <View className="flex-1 mr-4">
                  <Text className="text-white font-medium">Show Menu Item Images</Text>
                  <Text className="text-label text-xs mt-0.5">
                    Display images on menu items in the order screen
                  </Text>
                </View>
                <Switch checked={showMenuImages} onCheckedChange={setShowMenuImages} />
              </View>

              {/* Theme: coming soon placeholder */}
              <View className="flex-row items-center justify-between py-3">
                <View className="flex-1 mr-4">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-white font-medium">App Theme</Text>
                    <View className="px-1.5 py-0.5 bg-gray-700 rounded">
                      <Text className="text-xs text-gray-400">Coming Soon</Text>
                    </View>
                  </View>
                  <Text className="text-label text-xs mt-0.5">
                    Choose between Dark and Light mode
                  </Text>
                </View>
                <View className="flex-row gap-2">
                  <View className="px-3 py-1.5 bg-blue-600/20 border border-blue-500/40 rounded-lg">
                    <Text className="text-blue-300 text-xs font-medium">Dark</Text>
                  </View>
                  <View className="px-3 py-1.5 bg-surface border border-border rounded-lg opacity-40">
                    <Text className="text-label text-xs">Light</Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ── Sync ── */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader(
            "Sync",
            <RefreshCw size={20} color={colors.teal} />,
            "sync"
          )}
          {expandedSections.sync && (
            <View className="p-5">
              {renderSyncButton(
                "Sync POS",
                "Flush all pending operations to the server",
                <RefreshCw size={18} color={colors.teal} />,
                "pos",
                handleSyncPOS
              )}
              {renderSyncButton(
                "Fetch Latest Orders",
                "Re-download active orders from the server",
                <ShoppingBag size={18} color={colors.info} />,
                "orders",
                handleFetchOrders
              )}
              {renderSyncButton(
                "Fetch Latest Menus",
                "Re-download current menu items and categories",
                <UtensilsCrossed size={18} color="#a78bfa" />,
                "menus",
                handleFetchMenus
              )}
              {renderSyncButton(
                "Fetch Latest POS Settings",
                "Re-download all POS configurations",
                <ListChecks size={18} color={colors.warning} />,
                "settings",
                handleFetchSettings
              )}
            </View>
          )}
        </View>

        {/* ── Cache & Data ── */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-6">
          {renderSectionHeader(
            "Cache & Data",
            <Trash2 size={20} color={colors.danger} />,
            "cache"
          )}
          {expandedSections.cache && (
            <View className="p-5">
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-1 mr-4">
                  <Text className="text-white font-medium">Clear Cache</Text>
                  <Text className="text-label text-xs mt-0.5">
                    Clears orders and local data. Your session and account remain active.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowClearCacheModal(true)}
                  disabled={isClearing}
                  className="bg-red-600 px-4 py-2 rounded-lg"
                >
                  <Text className="text-white font-semibold text-sm">
                    {isClearing ? "Clearing..." : "Clear"}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text className="text-gray-500 text-xs">
                Device ID, store settings, employees, and your logged-in account will be preserved.
              </Text>
            </View>
          )}
        </View>

        {/* ── Log Out (requires manager PIN) ── */}
        <View className="bg-panel rounded-xl border border-gray-700 mb-10 p-5">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View className="w-8 h-8 bg-red-500/20 rounded-lg items-center justify-center">
                <LogOut size={20} color={colors.danger} />
              </View>
              <View>
                <Text className="text-white font-bold text-lg">Log Out</Text>
                <Text className="text-label text-xs">Requires manager PIN</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setShowLogoutPinGate(true)}
              disabled={isLoggingOut}
              className="px-4 py-2 bg-red-500 rounded-lg"
            >
              <Text className="text-white font-semibold text-lg">Log Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* ── Manager PIN gate for logout ── */}
      <PinGateModal
        visible={showLogoutPinGate}
        title="Approve logout from this station"
        onSuccess={() => {
          setShowLogoutPinGate(false);
          setShowLogoutModal(true);
        }}
        onCancel={() => setShowLogoutPinGate(false)}
      />

      {/* ── Logout options modal (shown after PIN) ── */}
      <SessionLogoutModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onEndStationSession={handleEndStationSession}
        onFullLogout={handleFullLogout}
        isLoading={isLoggingOut}
        stationName={selectedStation?.station_name}
      />

      {/* ── Clear Cache Confirmation ── */}
      <ConfirmationModal
        isOpen={showClearCacheModal}
        onClose={() => setShowClearCacheModal(false)}
        onConfirm={handleClearCache}
        title="Clear Cache?"
        description="This will remove all locally cached orders and session data. Your account, employees, device settings, and store configuration will be preserved."
        confirmText="Clear Cache"
        variant="destructive"
      />
    </View>
  );
};

export default GeneralSettingsScreen;
