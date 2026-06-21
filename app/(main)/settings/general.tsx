import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad from "@/components/auth/PinNumpad";
import SessionLogoutModal from "@/components/auth/SessionLogoutModal";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { Switch } from "@/components/ui/switch";
import { useSessionKick } from "@/contexts/SessionKickListenerProvider";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getDeviceId } from "@/lib/deviceId";
import { replaceRoute } from "@/lib/rootNavigation";
import {
    getSpeedQuality,
    runSpeedTest,
    type SpeedTestResult,
} from "@/lib/speedTest";
import { colors, spinnerColor } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import type { MerchantRole } from "@/lib/types";
import { useColorScheme } from "@/lib/useColorScheme";
import { clearStationData, resetClientSession } from "@/services/cacheService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useClerk } from "@clerk/clerk-expo";
import { useQueryClient } from "@tanstack/react-query";
import {
    Building2,
    ChevronDown,
    ChevronUp,
    Clock,
    ExternalLink,
    LogOut,
    MapPin,
    Phone,
    Store,
    Sun,
    Trash2,
    Wifi,
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
        withTiming(0, { duration: 100 }),
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
          <View
            style={{
              backgroundColor: colors.panel,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 16,
              padding: 24,
            }}
          >
            <Text
              style={{
                textAlign: "center",
                fontSize: 18,
                fontWeight: "700",
                color: colors.heading,
                marginBottom: 4,
              }}
            >
              Manager PIN Required
            </Text>
            <Text
              style={{
                textAlign: "center",
                fontSize: 13,
                color: colors.label,
                marginBottom: 16,
              }}
            >
              {title}
            </Text>
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
              style={{
                paddingVertical: 10,
                backgroundColor: colors.teal + "20",
                borderWidth: 1,
                borderColor: colors.teal + "50",
                borderRadius: 8,
                marginTop: 12,
              }}
            >
              <Text
                style={{
                  textAlign: "center",
                  fontSize: 13,
                  fontWeight: "700",
                  color: colors.teal,
                }}
              >
                Verify
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCancel}
              style={{ paddingVertical: 8, marginTop: 8 }}
            >
              <Text
                style={{
                  textAlign: "center",
                  fontSize: 13,
                  color: colors.label,
                }}
              >
                Cancel
              </Text>
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
  const supabase = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);

  const showMenuImages = useSettingsStore((s) => s.showMenuImages);
  const setShowMenuImages = useSettingsStore((s) => s.setShowMenuImages);
  const posMenuNavigationMode = useSettingsStore(
    (s) => s.posMenuNavigationMode ?? "classic",
  );
  const setPosMenuNavigationMode = useSettingsStore(
    (s) => s.setPosMenuNavigationMode,
  );
  const autoSelectFirstRequiredOption = useSettingsStore(
    (s) => s.autoSelectFirstRequiredOption,
  );
  const setAutoSelectFirstRequiredOption = useSettingsStore(
    (s) => s.setAutoSelectFirstRequiredOption,
  );
  const { colorScheme, setColorScheme } = useColorScheme();

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
    ? [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ].map((day) => {
        const key =
          day.toLowerCase() as keyof typeof selectedStore.business_hours;
        const h = selectedStore.business_hours[key];
        return {
          day,
          open: h?.open || "09:00",
          close: h?.close || "17:00",
          enabled: !h?.is_closed,
        };
      })
    : [];

  // ── Collapsible sections ────────────────────────────────────────────────
  const [expandedSections, setExpandedSections] = useState({
    info: true,
    hours: false,
    display: true,
    network: false,
    cache: true,
  });
  const toggleSection = (s: keyof typeof expandedSections) =>
    setExpandedSections((prev) => ({ ...prev, [s]: !prev[s] }));

  // ── Speed test ──────────────────────────────────────────────────────────
  const [speedTestResult, setSpeedTestResult] =
    useState<SpeedTestResult | null>(null);
  const [isTestingSpeed, setIsTestingSpeed] = useState(false);

  const handleSpeedTest = async () => {
    setIsTestingSpeed(true);
    setSpeedTestResult(null);
    try {
      const result = await runSpeedTest();
      setSpeedTestResult(result);
    } catch {
      toastService.show({
        title: "Speed Test Failed",
        message: "Could not complete the speed test. Check your connection.",
        type: "error",
      });
    } finally {
      setIsTestingSpeed(false);
    }
  };

  // ── Clear cache (preserves user session) ───────────────────────────────
  const [showClearCacheModal, setShowClearCacheModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleClearCache = async () => {
    setIsClearing(true);
    setShowClearCacheModal(false);
    try {
      clearStationData();
      toastService.show({
        title: "Cache Cleared",
        message: "Orders and local data cleared. Your session is preserved.",
        type: "success",
      });
    } catch {
      toastService.show({
        title: "Error",
        message: "Failed to clear cache.",
        type: "error",
      });
    } finally {
      setIsClearing(false);
    }
  };

  // ── Log out — requires manager PIN ─────────────────────────────────────
  const { signOut } = useClerk();
  const { markVoluntaryLogout } = useSessionKick();
  const stationSessionId = useStoreSettingsStore((s) => s.stationSessionId);
  const clearSelectedStore = useStoreSettingsStore((s) => s.clearSelectedStore);
  const clearStationSession = useStoreSettingsStore(
    (s) => s.clearStationSession,
  );

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
    markVoluntaryLogout();
    try {
      await endStationSessionOnServer();
      clearStationSession();
      clearStationData();
      setShowLogoutModal(false);
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
      setIsLoggingOut(false);
    }
  };

  const handleFullLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    markVoluntaryLogout();
    try {
      await endStationSessionOnServer();
      await resetClientSession();
      try {
        await signOut();
      } catch (error) {
        console.warn(
          "Settings logout network call failed after local reset:",
          error,
        );
      }
      setShowLogoutModal(false);
      replaceRoute("(auth)", "login");
    } catch {
      toastService.show({
        title: "Error",
        message: "Failed to logout. Please try again.",
        type: "error",
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  const renderSectionHeader = (
    title: string,
    icon: React.ReactNode,
    section: keyof typeof expandedSections,
    badge?: string,
  ) => (
    <TouchableOpacity
      onPress={() => toggleSection(section)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderBottomWidth: expandedSections[section] ? 1 : 0,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: colors.teal + "15",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </View>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "700",
            color: colors.heading,
          }}
        >
          {title}
        </Text>
        {badge && (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              backgroundColor: colors.teal + "20",
              borderWidth: 1,
              borderColor: colors.teal + "50",
              borderRadius: 20,
            }}
          >
            <Text style={{ fontSize: 11, color: colors.teal }}>{badge}</Text>
          </View>
        )}
      </View>
      {expandedSections[section] ? (
        <ChevronUp size={14} color={colors.label} />
      ) : (
        <ChevronDown size={14} color={colors.label} />
      )}
    </TouchableOpacity>
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.screen,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      {/* Header */}
      <View style={{ marginBottom: 10 }}>
        <Text
          style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}
        >
          General Settings
        </Text>
        <Text style={{ fontSize: 11, color: colors.label, marginTop: 1 }}>
          Business information, display preferences, and system utilities.
        </Text>
      </View>

      <View
        style={{ height: 1, backgroundColor: colors.border, marginBottom: 10 }}
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── Business Information (read-only) ── */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 12,
            overflow: "hidden",
          }}
        >
          {renderSectionHeader(
            "Business Information",
            <Store size={16} color={colors.teal} />,
            "info",
            "Read-only",
          )}
          {expandedSections.info && (
            <View style={{ padding: 12, gap: 8 }}>
              {/* Info notice */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  padding: 9,
                  backgroundColor: colors.teal + "15",
                  borderWidth: 1,
                  borderColor: colors.teal + "40",
                  borderRadius: 8,
                }}
              >
                <ExternalLink size={13} color={colors.teal} />
                <Text style={{ fontSize: 10, color: colors.teal, flex: 1 }}>
                  To update business information, visit your dashboard on the
                  website.
                </Text>
              </View>

              {/* Business Name */}
              <View>
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.label,
                    marginBottom: 4,
                    fontWeight: "500",
                  }}
                >
                  Business Name
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    gap: 8,
                  }}
                >
                  <Building2 size={14} color={colors.teal} />
                  <Text
                    style={{ fontSize: 13, color: colors.heading, flex: 1 }}
                  >
                    {displayStoreName}
                  </Text>
                </View>
              </View>

              {/* Address */}
              <View>
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.label,
                    marginBottom: 4,
                    fontWeight: "500",
                  }}
                >
                  Address
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    gap: 8,
                  }}
                >
                  <MapPin size={14} color={colors.teal} />
                  <Text
                    style={{ fontSize: 13, color: colors.heading, flex: 1 }}
                  >
                    {displayAddress}
                  </Text>
                </View>
              </View>

              {/* Phone */}
              <View>
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.label,
                    marginBottom: 4,
                    fontWeight: "500",
                  }}
                >
                  Phone
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    gap: 8,
                  }}
                >
                  <Phone size={14} color={colors.teal} />
                  <Text
                    style={{ fontSize: 13, color: colors.heading, flex: 1 }}
                  >
                    {displayPhone}
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ── Operating Hours (read-only) ── */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 12,
            overflow: "hidden",
          }}
        >
          {renderSectionHeader(
            "Operating Hours",
            <Clock size={16} color={colors.teal} />,
            "hours",
            "Read-only",
          )}
          {expandedSections.hours && (
            <View style={{ padding: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  padding: 9,
                  backgroundColor: colors.teal + "15",
                  borderWidth: 1,
                  borderColor: colors.teal + "40",
                  borderRadius: 8,
                  marginBottom: 10,
                }}
              >
                <ExternalLink size={13} color={colors.teal} />
                <Text style={{ fontSize: 10, color: colors.teal, flex: 1 }}>
                  To update operating hours, visit your dashboard on the
                  website.
                </Text>
              </View>

              {displayHours.length === 0 ? (
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.label,
                    textAlign: "center",
                    paddingVertical: 8,
                  }}
                >
                  No hours configured.
                </Text>
              ) : (
                displayHours.map((h) => (
                  <View
                    key={h.day}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      opacity: h.enabled ? 1 : 0.4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: colors.heading,
                        fontWeight: "500",
                        width: 100,
                      }}
                    >
                      {h.day}
                    </Text>
                    {h.enabled ? (
                      <Text style={{ fontSize: 13, color: colors.label }}>
                        {h.open} – {h.close}
                      </Text>
                    ) : (
                      <Text
                        style={{
                          fontSize: 13,
                          color: colors.muted,
                          fontStyle: "italic",
                        }}
                      >
                        Closed
                      </Text>
                    )}
                  </View>
                ))
              )}
            </View>
          )}
        </View>

        {/* ── Display Preferences ── */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 12,
            overflow: "hidden",
          }}
        >
          {renderSectionHeader(
            "Display",
            <Sun size={16} color={colors.teal} />,
            "display",
          )}
          {expandedSections.display && (
            <View style={{ padding: 12, gap: 2 }}>
              {/* POS Menu Navigation */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.heading,
                      fontWeight: "500",
                    }}
                  >
                    POS Menu Navigation
                  </Text>
                  <Text
                    style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}
                  >
                    Choose between menu category popups and the compact selector
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setPosMenuNavigationMode("popup")}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      backgroundColor:
                        posMenuNavigationMode === "popup"
                          ? colors.teal + "20"
                          : "transparent",
                      borderWidth: 1,
                      borderColor:
                        posMenuNavigationMode === "popup"
                          ? colors.teal + "50"
                          : colors.border,
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color:
                          posMenuNavigationMode === "popup"
                            ? colors.teal
                            : colors.label,
                        fontWeight: "500",
                      }}
                    >
                      Popup
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setPosMenuNavigationMode("classic")}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      backgroundColor:
                        posMenuNavigationMode === "classic"
                          ? colors.teal + "20"
                          : "transparent",
                      borderWidth: 1,
                      borderColor:
                        posMenuNavigationMode === "classic"
                          ? colors.teal + "50"
                          : colors.border,
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color:
                          posMenuNavigationMode === "classic"
                            ? colors.teal
                            : colors.label,
                        fontWeight: "500",
                      }}
                    >
                      Classic
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Show Menu Item Images */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.heading,
                      fontWeight: "500",
                    }}
                  >
                    Show Menu Item Images
                  </Text>
                  <Text
                    style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}
                  >
                    Display images on menu items in the order screen
                  </Text>
                </View>
                <Switch
                  checked={showMenuImages}
                  onCheckedChange={setShowMenuImages}
                />
              </View>

              {/* Auto-select first required option */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.heading,
                      fontWeight: "500",
                    }}
                  >
                    Auto-select first required option
                  </Text>
                  <Text
                    style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}
                  >
                    When a required modifier group has no preset default,
                    automatically pick the first free option. Turn off to
                    require manual selection.
                  </Text>
                </View>
                <Switch
                  checked={autoSelectFirstRequiredOption}
                  onCheckedChange={setAutoSelectFirstRequiredOption}
                />
              </View>

              {/* Theme */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 10,
                }}
              >
                <View style={{ flex: 1, marginRight: 16 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: colors.heading,
                        fontWeight: "500",
                      }}
                    >
                      App Theme
                    </Text>
                  </View>
                  <Text
                    style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}
                  >
                    Choose between Dark and Light mode
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setColorScheme("dark")}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      backgroundColor:
                        colorScheme === "dark"
                          ? colors.teal + "20"
                          : "transparent",
                      borderWidth: 1,
                      borderColor:
                        colorScheme === "dark"
                          ? colors.teal + "50"
                          : colors.border,
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color:
                          colorScheme === "dark" ? colors.teal : colors.label,
                        fontWeight: "500",
                      }}
                    >
                      Dark
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setColorScheme("light")}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      backgroundColor:
                        colorScheme === "light"
                          ? colors.teal + "20"
                          : "transparent",
                      borderWidth: 1,
                      borderColor:
                        colorScheme === "light"
                          ? colors.teal + "50"
                          : colors.border,
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color:
                          colorScheme === "light" ? colors.teal : colors.label,
                        fontWeight: "500",
                      }}
                    >
                      Light
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ── Network Speed Test ── */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 12,
            overflow: "hidden",
          }}
        >
          {renderSectionHeader(
            "Network",
            <Wifi size={16} color={colors.teal} />,
            "network",
          )}
          {expandedSections.network && (
            <View style={{ padding: 12 }}>
              {/* Run Speed Test button */}
              <TouchableOpacity
                onPress={handleSpeedTest}
                disabled={isTestingSpeed}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  marginBottom: speedTestResult ? 12 : 0,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: colors.teal + "15",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  {isTestingSpeed ? (
                    <ActivityIndicator size="small" color={spinnerColor} />
                  ) : (
                    <Wifi size={16} color={colors.teal} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: colors.heading,
                    }}
                  >
                    {isTestingSpeed ? "Testing..." : "Run Speed Test"}
                  </Text>
                  <Text
                    style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}
                  >
                    Check download speed, latency, and connection type
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Results */}
              {speedTestResult &&
                (() => {
                  const quality = getSpeedQuality(speedTestResult);
                  const qualityColor =
                    quality === "good"
                      ? colors.success
                      : quality === "fair"
                        ? colors.warning
                        : colors.danger;
                  const qualityLabel =
                    quality === "good"
                      ? "Good"
                      : quality === "fair"
                        ? "Fair"
                        : "Poor";

                  return (
                    <View style={{ gap: 8 }}>
                      {/* Quality badge */}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          padding: 9,
                          backgroundColor: qualityColor + "15",
                          borderWidth: 1,
                          borderColor: qualityColor + "40",
                          borderRadius: 8,
                        }}
                      >
                        <Wifi size={13} color={qualityColor} />
                        <Text
                          style={{
                            fontSize: 12,
                            color: qualityColor,
                            fontWeight: "600",
                          }}
                        >
                          Connection Quality: {qualityLabel}
                        </Text>
                      </View>

                      {/* Metrics */}
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 8,
                        }}
                      >
                        {/* Download Speed */}
                        <View
                          style={{
                            flex: 1,
                            backgroundColor: colors.screen,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: 8,
                            padding: 10,
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              color: colors.muted,
                              marginBottom: 4,
                            }}
                          >
                            Download
                          </Text>
                          <Text
                            style={{
                              fontSize: 18,
                              fontWeight: "700",
                              color: colors.heading,
                            }}
                          >
                            {speedTestResult.downloadMbps}
                          </Text>
                          <Text style={{ fontSize: 10, color: colors.label }}>
                            Mbps
                          </Text>
                        </View>

                        {/* Latency */}
                        <View
                          style={{
                            flex: 1,
                            backgroundColor: colors.screen,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: 8,
                            padding: 10,
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              color: colors.muted,
                              marginBottom: 4,
                            }}
                          >
                            Latency
                          </Text>
                          <Text
                            style={{
                              fontSize: 18,
                              fontWeight: "700",
                              color: colors.heading,
                            }}
                          >
                            {speedTestResult.latencyMs}
                          </Text>
                          <Text style={{ fontSize: 10, color: colors.label }}>
                            ms
                          </Text>
                        </View>

                        {/* Connection Type */}
                        <View
                          style={{
                            flex: 1,
                            backgroundColor: colors.screen,
                            borderWidth: 1,
                            borderColor: colors.border,
                            borderRadius: 8,
                            padding: 10,
                            alignItems: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              color: colors.muted,
                              marginBottom: 4,
                            }}
                          >
                            Type
                          </Text>
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "700",
                              color: colors.heading,
                            }}
                            numberOfLines={1}
                          >
                            {speedTestResult.connectionType || "Unknown"}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })()}
            </View>
          )}
        </View>

        {/* ── Cache & Data ── */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 12,
            overflow: "hidden",
          }}
        >
          {renderSectionHeader(
            "Cache & Data",
            <Trash2 size={16} color={colors.teal} />,
            "cache",
          )}
          {expandedSections.cache && (
            <View style={{ padding: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.heading,
                      fontWeight: "500",
                    }}
                  >
                    Clear Cache
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}
                  >
                    Clears orders and local data. Your session and account
                    remain active.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowClearCacheModal(true)}
                  disabled={isClearing}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    backgroundColor: colors.danger + "15",
                    borderWidth: 1,
                    borderColor: colors.danger + "30",
                    borderRadius: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: colors.danger,
                    }}
                  >
                    {isClearing ? "Clearing..." : "Clear"}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 11, color: colors.muted }}>
                Device ID, store settings, employees, and your logged-in account
                will be preserved.
              </Text>
            </View>
          )}
        </View>

        {/* ── Log Out (requires manager PIN) ── */}
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 32,
            padding: 14,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: colors.danger + "15",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <LogOut size={16} color={colors.danger} />
              </View>
              <View>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: colors.heading,
                  }}
                >
                  Log Out
                </Text>
                <Text style={{ fontSize: 11, color: colors.label }}>
                  Requires manager PIN
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setShowLogoutPinGate(true)}
              disabled={isLoggingOut}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                backgroundColor: colors.danger + "15",
                borderWidth: 1,
                borderColor: colors.danger + "30",
                borderRadius: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: colors.danger,
                }}
              >
                Log Out
              </Text>
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
