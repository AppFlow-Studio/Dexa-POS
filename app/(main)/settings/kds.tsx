import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad from "@/components/auth/PinNumpad";
import SessionLogoutModal from "@/components/auth/SessionLogoutModal";
import { useSessionKick } from "@/contexts/SessionKickListenerProvider";
import { useToast } from "@/contexts/ToastContext";
import { useLocationStations } from "@/hooks/useLocationStations";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getDeviceId } from "@/lib/deviceId";
import { replaceRoute } from "@/lib/rootNavigation";
import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import type { MerchantRole } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { clearStationData, resetClientSession } from "@/services/cacheService";
import KDSSoundService, {
  DEFAULT_SOUND_CONFIG,
  type KDSSoundConfig,
  type SoundPreset,
} from "@/services/kds/kdsSoundService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useKDSStore } from "@/stores/useKDSStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { KdsConfig } from "@/types/locationConfig";
import type { Station } from "@/types/station";
import { useClerk } from "@clerk/clerk-expo";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  LogOut,
  Minus,
  Play,
  Plus,
  Search,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import AppUpdateModal from "@/components/AppUpdateModal";
import { DiscoveredPrinterList } from "@/components/settings/DiscoveredPrinterList";
import { ManualIpPanel } from "@/components/settings/ManualIpPanel";
import { usePrinterDiscovery } from "@/hooks/usePrinterDiscovery";
import {
  checkForNativeUpdate,
  type VersionManifest,
} from "@/services/appUpdater";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Switch } from "~/components/ui/switch";

// ---------------------------------------------------------------------------
// SHARED LITTLE COMPONENTS (mirrors the look of the Printers settings page)
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <Text
      style={{
        fontSize: s(11),
        fontWeight: "700",
        color: colors.muted,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginTop: s(16),
        marginBottom: s(6),
        paddingHorizontal: s(2),
      }}
    >
      {title}
    </Text>
  );
}

function ToggleRow({
  label,
  subtitle,
  value,
  onToggle,
}: {
  label: string;
  subtitle?: string;
  value: boolean;
  onToggle: (val: boolean) => void;
}) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: s(10),
        paddingHorizontal: s(12),
        backgroundColor: colors.card,
        borderRadius: s(8),
        marginBottom: s(4),
      }}
    >
      <View style={{ flex: 1, marginRight: s(10) }}>
        <Text
          style={{
            fontSize: s(13),
            color: colors.heading,
            marginBottom: subtitle ? s(2) : 0,
          }}
        >
          {label}
        </Text>
        {subtitle && (
          <Text style={{ fontSize: s(11), color: colors.muted }}>
            {subtitle}
          </Text>
        )}
      </View>
      <Switch checked={value} onCheckedChange={onToggle} />
    </View>
  );
}

function StepperRow({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: s(8),
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: s(12),
        paddingVertical: s(10),
        marginBottom: s(4),
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{ fontSize: s(12), color: colors.label, fontWeight: "500" }}
        >
          {label}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
          <TouchableOpacity
            onPress={() => onChange(Math.max(min, value - 1))}
            style={{
              backgroundColor: colors.panel,
              width: s(28),
              height: s(28),
              borderRadius: s(6),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Minus size={s(12)} color={colors.heading} />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: s(12),
              fontWeight: "700",
              color: colors.teal,
              minWidth: s(40),
              textAlign: "center",
            }}
          >
            {value}
            {suffix ?? ""}
          </Text>
          <TouchableOpacity
            onPress={() => onChange(Math.min(max, value + 1))}
            style={{
              backgroundColor: colors.panel,
              width: s(28),
              height: s(28),
              borderRadius: s(6),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Plus size={s(12)} color={colors.heading} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function OptionCards<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; desc?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <View style={{ flexDirection: "row", gap: s(8) }}>
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={{
              flex: 1,
              paddingHorizontal: s(10),
              paddingVertical: s(10),
              borderRadius: s(8),
              borderWidth: 1,
              borderColor: isSelected ? colors.teal + "50" : colors.border,
              backgroundColor: isSelected ? colors.teal + "15" : colors.panel,
            }}
          >
            <Text
              style={{
                fontSize: s(12),
                fontWeight: "700",
                color: isSelected ? colors.teal : colors.heading,
              }}
            >
              {opt.label}
            </Text>
            {opt.desc && (
              <Text
                style={{
                  fontSize: s(10),
                  marginTop: s(2),
                  color: isSelected ? colors.teal + "CC" : colors.muted,
                }}
              >
                {opt.desc}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Dropdown Row (from KDSSettingsModal) ────────────────────────
function DropdownRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (val: T) => void;
}) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const [open, setOpen] = useState(false);
  const currentLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: s(8),
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: s(12),
        paddingVertical: s(10),
        marginBottom: s(4),
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: s(12),
            color: colors.label,
            fontWeight: "500",
            flex: 1,
          }}
        >
          {label}
        </Text>
        <View>
          <TouchableOpacity
            onPress={() => setOpen(!open)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.panel,
              paddingHorizontal: s(10),
              paddingVertical: s(6),
              borderRadius: s(6),
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                color: colors.label,
                fontSize: s(11),
                marginRight: s(4),
              }}
            >
              {currentLabel}
            </Text>
            <Text style={{ color: colors.muted, fontSize: s(9) }}>▼</Text>
          </TouchableOpacity>
          {open && (
            <View
              style={{
                position: "absolute",
                top: s(36),
                right: 0,
                zIndex: 50,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: s(8),
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 8,
                elevation: 10,
                minWidth: s(140),
              }}
            >
              {options.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  style={{
                    paddingHorizontal: s(12),
                    paddingVertical: s(8),
                    backgroundColor:
                      opt.value === value ? colors.info + "20" : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color: opt.value === value ? colors.info : colors.heading,
                      fontSize: s(12),
                      fontWeight: opt.value === value ? "600" : "400",
                    }}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Sound Preset Row (from KDSSettingsModal) ────────────────────
const SOUND_PRESET_OPTIONS_LOCAL: { value: SoundPreset; label: string }[] = [
  { value: "chime", label: "Chime" },
  { value: "bell", label: "Bell" },
  { value: "alert", label: "Alert" },
  { value: "none", label: "None" },
];

function SoundPresetRow({
  label,
  value,
  onChange,
  onTest,
  testDisabled,
}: {
  label: string;
  value: SoundPreset;
  onChange: (preset: SoundPreset) => void;
  onTest: (preset: SoundPreset) => void;
  testDisabled?: boolean;
}) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const [open, setOpen] = useState(false);
  const currentLabel =
    SOUND_PRESET_OPTIONS_LOCAL.find((o) => o.value === value)?.label ?? value;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: s(6),
      }}
    >
      <Text style={{ color: colors.label, fontSize: s(11), flex: 1 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
        <View>
          <TouchableOpacity
            onPress={() => setOpen(!open)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.panel,
              paddingHorizontal: s(8),
              paddingVertical: s(4),
              borderRadius: s(6),
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                color: colors.label,
                fontSize: s(11),
                marginRight: s(4),
              }}
            >
              {currentLabel}
            </Text>
            <Text style={{ color: colors.muted, fontSize: s(9) }}>▼</Text>
          </TouchableOpacity>
          {open && (
            <View
              style={{
                position: "absolute",
                top: s(30),
                right: 0,
                zIndex: 50,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: s(8),
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 8,
                elevation: 10,
                minWidth: s(100),
              }}
            >
              {SOUND_PRESET_OPTIONS_LOCAL.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  style={{
                    paddingHorizontal: s(10),
                    paddingVertical: s(6),
                    backgroundColor:
                      opt.value === value ? colors.info + "20" : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color: opt.value === value ? colors.info : colors.heading,
                      fontSize: s(11),
                      fontWeight: opt.value === value ? "600" : "400",
                    }}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={() => onTest(value)}
          disabled={testDisabled}
          style={{
            backgroundColor: colors.panel,
            padding: s(5),
            borderRadius: s(6),
            borderWidth: 1,
            borderColor: colors.border,
            opacity: testDisabled ? 0.4 : 1,
          }}
        >
          <Play size={s(12)} color={colors.info} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SCREEN
// ---------------------------------------------------------------------------

const MODIFIER_GROUP_OPTIONS: {
  value: KdsConfig["displayModifierGroupName"];
  label: string;
}[] = [
  { value: "for_group_priced", label: "Priced" },
  { value: "always", label: "Always" },
  { value: "never", label: "Never" },
];

const NEW_ORDER_POSITION_OPTIONS = [
  { value: "right", label: "RIGHT (Newest Last)" },
  { value: "left", label: "LEFT (Newest First)" },
] as const;

// ─── Per-Station Display Panel ───────────────────────────────────
function StationDisplayPanel({
  station,
  displayId,
  displayConfig,
  onRefresh,
  supabase,
  selectedStationId,
}: {
  station: Station;
  displayId: string | null;
  displayConfig: import("@/types/kds").KDSDisplayConfig | null;
  onRefresh: (stationId: string) => void;
  supabase: ReturnType<typeof useSupabaseClient>;
  selectedStationId?: string | null;
}) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const toast = useToast();
  const kdsDisplayId = useKDSStore((s) => s.kdsDisplayId);
  const fetchKDSDisplay = useKDSStore((s) => s.fetchKDSDisplay);

  // Sound state
  const [soundOnNewOrder, setSoundOnNewOrder] = useState(false);
  const [soundConfig, setSoundConfig] = useState<KDSSoundConfig>({
    ...DEFAULT_SOUND_CONFIG,
  });
  const [soundServicePreview] = useState(() => new KDSSoundService());
  const [previewReady, setPreviewReady] = useState(false);
  const [isSavingSound, setIsSavingSound] = useState(false);

  useEffect(() => {
    if (displayConfig) {
      setSoundOnNewOrder(displayConfig.soundOnNewOrder ?? false);
      if (displayConfig.soundConfig) {
        setSoundConfig(displayConfig.soundConfig);
      }
    }
  }, [displayConfig]);

  useEffect(() => {
    soundServicePreview.init().then(() => setPreviewReady(true));
    return () => {
      soundServicePreview.dispose();
    };
  }, []);

  const saveSoundConfig = useCallback(
    async (newSoundOn: boolean, newConfig: KDSSoundConfig) => {
      if (!displayId) return;
      setIsSavingSound(true);
      try {
        await supabase
          .from("kds_displays")
          .update({
            sound_on_new_order: newSoundOn,
            sound_config: newConfig as any,
          })
          .eq("id", displayId);
        if (selectedStationId) fetchKDSDisplay(selectedStationId);
      } catch (err) {
        console.error("[KDSSettings] saveSoundConfig error:", err);
      } finally {
        setIsSavingSound(false);
      }
    },
    [displayId, supabase, selectedStationId, fetchKDSDisplay],
  );

  const handleSoundToggle = useCallback(
    (val: boolean) => {
      setSoundOnNewOrder(val);
      saveSoundConfig(val, soundConfig);
    },
    [soundConfig, saveSoundConfig],
  );

  const handleSoundPresetChange = useCallback(
    (key: keyof KDSSoundConfig, preset: SoundPreset) => {
      const updated = { ...soundConfig, [key]: preset };
      setSoundConfig(updated);
      saveSoundConfig(soundOnNewOrder, updated);
    },
    [soundConfig, soundOnNewOrder, saveSoundConfig],
  );

  if (!displayId) {
    return (
      <View style={{ paddingVertical: s(16), alignItems: "center" }}>
        <Text
          style={{ color: colors.muted, fontSize: s(12), fontStyle: "italic" }}
        >
          No KDS display configured for {station.station_name}.
        </Text>
        <Text style={{ color: colors.muted, fontSize: s(11), marginTop: s(4) }}>
          Configure displays in the admin website.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {/* Display name + ID */}
      <View style={{ marginBottom: s(8) }}>
        <Text
          style={{ color: colors.heading, fontSize: s(13), fontWeight: "600" }}
        >
          {displayConfig?.displayName ?? "Kitchen Display"}
        </Text>
        <Text
          style={{
            color: colors.muted,
            fontSize: s(10),
            marginTop: s(2),
            fontFamily: "monospace",
          }}
        >
          {displayId}
        </Text>
      </View>

      {/* Routing info */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: s(8),
          marginBottom: s(10),
        }}
      >
        <View
          style={{
            backgroundColor:
              (displayConfig?.showAllItems === true
                ? colors.warning
                : colors.teal) + "20",
            paddingHorizontal: s(10),
            paddingVertical: s(4),
            borderRadius: s(12),
            borderWidth: 1,
            borderColor:
              (displayConfig?.showAllItems === true
                ? colors.warning
                : colors.teal) + "55",
          }}
        >
          <Text
            style={{
              color:
                displayConfig?.showAllItems === true
                  ? colors.warning
                  : colors.teal,
              fontSize: s(10),
              fontWeight: "700",
              letterSpacing: 0.5,
            }}
          >
            ORPHANED ITEMS:{" "}
            {displayConfig?.showAllItems === true ? "ON" : "OFF"}
          </Text>
        </View>
      </View>

      {/* Display Toggles */}
      <SectionHeader title="Display" />
      <ToggleRow
        label="Display Server Name"
        subtitle="Show the server's name on each ticket"
        value={displayConfig?.showServerName ?? false}
        onToggle={async (val) => {
          if (!displayId) return;
          try {
            await supabase
              .from("kds_displays")
              .update({ show_server_name: val })
              .eq("id", displayId);
            if (selectedStationId) fetchKDSDisplay(selectedStationId);
          } catch (err) {
            console.error("[KDSSettings] saveShowServerName error:", err);
          }
        }}
      />

      {/* Sound Section */}
      <SectionHeader title="Sound" />
      <ToggleRow
        label="Sound on New Order"
        value={soundOnNewOrder}
        onToggle={handleSoundToggle}
      />
      <TouchableOpacity
        onPress={() => {
          const cb = useKDSStore.getState()._onNewOrderCallback;
          if (!cb) {
            toast.show({
              title: "KDS not ready",
              message:
                "Open the KDS screen first so the sound trigger is wired up.",
              type: "warning",
              duration: 3000,
            });
            return;
          }
          if (!soundOnNewOrder) {
            toast.show({
              title: "Sound is disabled",
              message: "Turn on 'Sound on New Order' first, then test again.",
              type: "warning",
              duration: 3000,
            });
            return;
          }
          cb("pos");
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: s(6),
          paddingVertical: s(8),
          paddingHorizontal: s(12),
          marginBottom: s(4),
          backgroundColor: colors.teal,
          borderRadius: s(8),
        }}
      >
        <Play size={s(14)} color={colors.onSolid} />
        <Text
          style={{ color: colors.onSolid, fontSize: s(12), fontWeight: "600" }}
        >
          Test New-Order Sound
        </Text>
      </TouchableOpacity>
      <Text
        style={{
          color: colors.muted,
          fontSize: s(10),
          marginBottom: s(4),
          fontStyle: "italic",
        }}
      >
        Simulates a real broadcast — exercises the full trigger → audio path the
        kitchen hears for live orders.
      </Text>
      {soundOnNewOrder && (
        <View style={{ marginLeft: s(8) }}>
          {(["pos", "online", "kiosk", "third_party", "default"] as const).map(
            (key) => (
              <SoundPresetRow
                key={key}
                label={
                  key === "third_party"
                    ? "Third-party"
                    : key.charAt(0).toUpperCase() + key.slice(1)
                }
                value={soundConfig[key]}
                onChange={(v) => handleSoundPresetChange(key, v)}
                onTest={(v) => soundServicePreview.playPreview(v)}
                testDisabled={!previewReady}
              />
            ),
          )}
          {isSavingSound && (
            <Text
              style={{ color: colors.muted, fontSize: s(10), marginTop: s(4) }}
            >
              Saving...
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Manager PIN Gate Modal ────────────────────────────────────────────────
const MANAGER_ROLES: MerchantRole[] = [
  "merchant.manager",
  "merchant.admin",
  "merchant.owner",
];

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
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
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
              borderRadius: s(16),
              padding: s(24),
            }}
          >
            <Text
              style={{
                textAlign: "center",
                fontSize: s(18),
                fontWeight: "700",
                color: colors.heading,
                marginBottom: s(4),
              }}
            >
              Manager PIN Required
            </Text>
            <Text
              style={{
                textAlign: "center",
                fontSize: s(13),
                color: colors.label,
                marginBottom: s(16),
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
                paddingVertical: s(10),
                backgroundColor: colors.teal + "20",
                borderWidth: 1,
                borderColor: colors.teal + "50",
                borderRadius: s(8),
                marginTop: s(12),
              }}
            >
              <Text
                style={{
                  textAlign: "center",
                  fontSize: s(13),
                  fontWeight: "700",
                  color: colors.teal,
                }}
              >
                Verify
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCancel}
              style={{ paddingVertical: s(8), marginTop: s(8) }}
            >
              <Text
                style={{
                  textAlign: "center",
                  fontSize: s(13),
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

// ---------------------------------------------------------------------------
// TICKET PRINTER — lets THIS KDS device claim a printer and auto-print each
// ticket that lands on its board. Only rendered on a KDS device: the printer
// is a per-device concern and the auto-print flag is device-local (MMKV).
// ---------------------------------------------------------------------------
function KdsTicketPrinterSection() {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const selectedStation = useStoreSettingsStore((st) => st.selectedStation);
  const selectedStore = useStoreSettingsStore((st) => st.selectedStore);
  const printers = usePrinterStore((st) => st.printers);
  const setStationReceiptPrinter = usePrinterStore(
    (st) => st.setStationReceiptPrinter,
  );
  const autoPrintEnabled = useSettingsStore((st) => st.kdsAutoPrintEnabled);
  const setAutoPrintEnabled = useSettingsStore(
    (st) => st.setKdsAutoPrintEnabled,
  );
  const [showAddPrinter, setShowAddPrinter] = useState(false);

  const claimedId = selectedStation?.current_receipt_printer_id ?? null;

  // Printers this KDS can drive: active printers at this location that are
  // either location-level (network — any device can reach them) or attached to
  // THIS device's own station.
  const available = useMemo(
    () =>
      printers.filter(
        (p) =>
          p.isActive &&
          p.locationId === selectedStore?.id &&
          (p.stationId == null || p.stationId === selectedStation?.id),
      ),
    [printers, selectedStore?.id, selectedStation?.id],
  );

  const claimedPrinter = claimedId
    ? printers.find((p) => p.id === claimedId) ?? null
    : null;

  const handleSelect = async (printerId: string) => {
    if (!selectedStation?.id) return;
    try {
      await setStationReceiptPrinter(selectedStation.id, printerId);
    } catch {
      toastService.show({
        title: "Couldn't assign printer",
        message: "Try again.",
        type: "error",
      });
    }
  };

  const handleTestPrint = async () => {
    if (!claimedPrinter) return;
    try {
      const {
        PrinterService,
      } = require("@/services/printing/PrinterService");
      const ok = await PrinterService.printTestKitchenTicket(claimedPrinter);
      toastService.show({
        title: ok ? "Test sent" : "Test failed",
        message: ok
          ? `Sent a test ticket to ${claimedPrinter.printerName}.`
          : "Could not reach the printer.",
        type: ok ? "success" : "error",
      });
    } catch {
      toastService.show({
        title: "Test failed",
        message: "Could not reach the printer.",
        type: "error",
      });
    }
  };

  return (
    <>
      <SectionHeader title="Ticket Printer" />
      <Text
        style={{
          fontSize: s(11),
          color: colors.muted,
          marginBottom: s(8),
          paddingHorizontal: s(2),
        }}
      >
        Physically print each ticket that lands on this display. Pick a printer
        this device can reach (a network printer, or one attached to this
        device) and turn on auto-print.
      </Text>

      <ToggleRow
        label="Auto-print tickets"
        subtitle="Print a kitchen ticket when an order reaches this display"
        value={autoPrintEnabled}
        onToggle={setAutoPrintEnabled}
      />

      {available.length === 0 ? (
        <Text
          style={{
            fontSize: s(12),
            color: colors.muted,
            paddingVertical: s(10),
            paddingHorizontal: s(12),
          }}
        >
          No printers found for this location. Add a network printer from a POS
          station&apos;s Printers settings, then it will appear here.
        </Text>
      ) : (
        available.map((p) => {
          const selected = p.id === claimedId;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => handleSelect(p.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: s(10),
                paddingHorizontal: s(12),
                borderRadius: s(8),
                borderWidth: 1,
                borderColor: selected ? colors.teal : colors.border,
                backgroundColor: selected ? colors.teal + "18" : colors.card,
                marginBottom: s(4),
              }}
            >
              <View style={{ flex: 1, marginRight: s(10) }}>
                <Text style={{ fontSize: s(13), color: colors.heading }}>
                  {p.printerName}
                </Text>
                <Text style={{ fontSize: s(11), color: colors.muted }}>
                  {p.connectionType ?? "network"}
                  {p.networkAddress ? ` · ${p.networkAddress}` : ""}
                </Text>
              </View>
              {selected && (
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: "700",
                    color: colors.teal,
                  }}
                >
                  SELECTED
                </Text>
              )}
            </TouchableOpacity>
          );
        })
      )}

      <View style={{ flexDirection: "row", gap: s(8), marginTop: s(8) }}>
        <TouchableOpacity
          onPress={() => setShowAddPrinter(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(6),
            paddingHorizontal: s(14),
            paddingVertical: s(8),
            borderRadius: s(8),
            backgroundColor: colors.teal,
          }}
        >
          <Search size={s(14)} color="#FFFFFF" />
          <Text
            style={{ fontSize: s(12), fontWeight: "700", color: "#FFFFFF" }}
          >
            Add / Detect Printer
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleTestPrint}
          disabled={!claimedPrinter}
          style={{
            paddingHorizontal: s(14),
            paddingVertical: s(8),
            borderRadius: s(8),
            borderWidth: 1,
            borderColor: colors.teal,
            opacity: claimedPrinter ? 1 : 0.4,
          }}
        >
          <Text
            style={{ fontSize: s(12), fontWeight: "600", color: colors.teal }}
          >
            Test Print
          </Text>
        </TouchableOpacity>
      </View>

      {showAddPrinter && (
        <KdsAddPrinterModal onClose={() => setShowAddPrinter(false)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ADD / DETECT PRINTER — scans the LAN for Star printers or takes a manual IP,
// provisions the chosen one as a location-level printer; it then shows up in
// the picker above to assign to this display. Reuses the same discovery engine
// + UI (usePrinterDiscovery / DiscoveredPrinterList / ManualIpPanel) as the
// main Printers settings screen. Note: the one-shot scan works on a KDS even
// though the *background* Star discovery service is disabled there.
// ---------------------------------------------------------------------------
function KdsAddPrinterModal({ onClose }: { onClose: () => void }) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const {
    scanState,
    storedPrinters,
    discoveredPrinters,
    scan,
    provisionStar,
    addByManualIp,
    clearManualIpError,
  } = usePrinterDiscovery();

  const [manualIp, setManualIp] = useState("");
  const [showManualIp, setShowManualIp] = useState(false);

  const handleManualConnect = async () => {
    await addByManualIp(manualIp, "kitchen");
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          padding: s(20),
        }}
      >
        <View
          style={{
            backgroundColor: colors.screen,
            borderRadius: s(16),
            padding: s(16),
            maxHeight: "88%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: s(6),
            }}
          >
            <Text
              style={{
                fontSize: s(16),
                fontWeight: "700",
                color: colors.heading,
              }}
            >
              Add a Printer
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Text style={{ fontSize: s(13), color: colors.muted }}>Close</Text>
            </TouchableOpacity>
          </View>
          <Text
            style={{ fontSize: s(11), color: colors.muted, marginBottom: s(12) }}
          >
            Scan the network for Star printers or enter a printer&apos;s IP.
            Added printers appear in the picker to assign to this display.
          </Text>

          <ScrollView style={{ maxHeight: s(460) }}>
            <View
              style={{ flexDirection: "row", gap: s(8), marginBottom: s(8) }}
            >
              <TouchableOpacity
                onPress={() => {
                  if (!scanState.isScanning) scan();
                }}
                disabled={scanState.isScanning}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: s(6),
                  paddingVertical: s(11),
                  borderRadius: s(10),
                  backgroundColor: colors.teal,
                  opacity: scanState.isScanning ? 0.7 : 1,
                }}
              >
                {scanState.isScanning ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Search size={s(15)} color="#FFFFFF" />
                )}
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: "700",
                    color: "#FFFFFF",
                  }}
                >
                  {scanState.isScanning
                    ? `Scanning… ${scanState.scanSecondsRemaining ?? 0}s`
                    : "Scan Network"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowManualIp((v) => !v)}
                style={{
                  paddingHorizontal: s(12),
                  paddingVertical: s(11),
                  borderRadius: s(10),
                  borderWidth: 1,
                  borderColor: showManualIp ? colors.teal : colors.border,
                  backgroundColor: showManualIp
                    ? colors.teal + "18"
                    : colors.card,
                }}
              >
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: "600",
                    color: showManualIp ? colors.teal : colors.label,
                  }}
                >
                  {showManualIp ? "Hide IP" : "Enter IP"}
                </Text>
              </TouchableOpacity>
            </View>

            {showManualIp && (
              <ManualIpPanel
                forRole="kitchen"
                manualIp={manualIp}
                onChangeIp={(ip) => {
                  setManualIp(ip);
                  if (scanState.manualIpError) clearManualIpError();
                }}
                manualIpError={scanState.manualIpError}
                onClearError={clearManualIpError}
                isProbing={scanState.isProbing}
                isScanningStar={scanState.isScanning}
                onConnect={handleManualConnect}
                onScanNetwork={scan}
                onCancel={() => {
                  setShowManualIp(false);
                  setManualIp("");
                  clearManualIpError();
                }}
              />
            )}

            <DiscoveredPrinterList
              discoveredPrinters={discoveredPrinters}
              storedPrinters={storedPrinters}
              isScanning={scanState.isScanning}
              scanSecondsRemaining={scanState.scanSecondsRemaining}
              scanError={scanState.scanError}
              provisioningIp={scanState.provisioningStarIp}
              testResults={{}}
              testingIp={null}
              onRefresh={scan}
              onProvision={(p, role) => provisionStar(p, role)}
              onTest={() => {}}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// ABOUT & UPDATES — on-device "Check for Updates" for the KDS. Mirrors the POS
// settings / kiosk updater: prefers a native APK update (Android, via the CDN
// version manifest) and falls back to an Expo OTA update (fetch + silent
// reload). The app also auto-checks on every launch (app.json checkOnLaunch:
// ALWAYS) — this is the manual "now" path.
// ---------------------------------------------------------------------------
function KdsUpdateSection() {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const [status, setStatus] = useState<
    "idle" | "checking" | "downloading" | "ready" | "up-to-date" | "error"
  >("idle");
  const [nativeManifest, setNativeManifest] = useState<VersionManifest | null>(
    null,
  );

  const version = Constants.expoConfig?.version ?? "—";
  const runtime =
    typeof Updates.runtimeVersion === "string" ? Updates.runtimeVersion : "—";

  const applyOtaUpdate = async () => {
    setStatus("downloading");
    try {
      await Updates.fetchUpdateAsync();
      setStatus("ready");
      setTimeout(() => {
        Updates.reloadAsync();
      }, 1500);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const handleCheck = async () => {
    if (status === "checking" || status === "downloading" || status === "ready")
      return;

    setStatus("checking");
    try {
      // 1. Native APK update (Android only) — opens AppUpdateModal.
      if (Platform.OS === "android") {
        const manifest = await checkForNativeUpdate();
        if (manifest) {
          setStatus("idle");
          setNativeManifest(manifest);
          return;
        }
      }

      // 2. Expo OTA update (skipped in dev — updates are disabled there).
      if (!__DEV__) {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          setStatus("idle");
          Alert.alert(
            "Update Available",
            "A new update is ready to download. The app will restart after installing.",
            [
              { text: "Later", style: "cancel" },
              { text: "Update Now", onPress: () => applyOtaUpdate() },
            ],
          );
          return;
        }
      }

      // 3. Nothing newer.
      setStatus("up-to-date");
      setTimeout(() => setStatus("idle"), 3000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const busy =
    status === "checking" || status === "downloading" || status === "ready";
  const buttonLabel =
    status === "checking"
      ? "Checking…"
      : status === "downloading"
        ? "Downloading…"
        : status === "ready"
          ? "Restarting…"
          : "Check for Updates";

  return (
    <>
      <SectionHeader title="About & Updates" />
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: s(12),
          borderWidth: 1,
          borderColor: colors.border,
          padding: s(14),
          marginBottom: s(4),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: s(2),
          }}
        >
          <Text
            style={{
              fontSize: s(14),
              fontWeight: "700",
              color: colors.heading,
            }}
          >
            Dexa POS
          </Text>
          {status === "up-to-date" ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: s(5) }}
            >
              <CheckCircle2 size={s(13)} color={colors.success} />
              <Text
                style={{
                  fontSize: s(11),
                  fontWeight: "700",
                  color: colors.success,
                }}
              >
                Up to date
              </Text>
            </View>
          ) : status === "error" ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: s(5) }}
            >
              <AlertCircle size={s(13)} color={colors.danger} />
              <Text
                style={{
                  fontSize: s(11),
                  fontWeight: "700",
                  color: colors.danger,
                }}
              >
                Check failed
              </Text>
            </View>
          ) : null}
        </View>

        <Text
          style={{ fontSize: s(11), color: colors.muted, marginBottom: s(12) }}
        >
          Version {version} · Runtime {runtime}
        </Text>

        <TouchableOpacity
          onPress={handleCheck}
          disabled={busy}
          activeOpacity={0.9}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: s(11),
            borderRadius: s(10),
            backgroundColor: colors.teal,
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Download size={s(16)} color="#FFFFFF" />
          )}
          <Text
            style={{
              fontSize: s(13),
              fontWeight: "700",
              color: "#FFFFFF",
              marginLeft: s(8),
            }}
          >
            {buttonLabel}
          </Text>
        </TouchableOpacity>

        {__DEV__ ? (
          <Text
            style={{
              fontSize: s(11),
              color: colors.muted,
              textAlign: "center",
              marginTop: s(8),
            }}
          >
            Updates are disabled in development builds.
          </Text>
        ) : null}
      </View>

      {nativeManifest && Platform.OS === "android" ? (
        <AppUpdateModal
          visible={!!nativeManifest}
          manifest={nativeManifest}
          onSkip={() => setNativeManifest(null)}
          onInstallComplete={() => setNativeManifest(null)}
        />
      ) : null}
    </>
  );
}

const KdsSettingsScreen = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const supabase = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((store) => store.selectedStore);
  const selectedStation = useStoreSettingsStore(
    (store) => store.selectedStation,
  );
  const kdsConfig = useLocationConfigStore((store) => store.config.kds);
  const updateConfig = useLocationConfigStore((store) => store.updateConfig);
  const { data: allStations } = useLocationStations();
  const toast = useToast();

  // KDS display (from store, fetched for currently selected station tab)
  const kdsDisplayId = useKDSStore((s) => s.kdsDisplayId);
  const kdsDisplayConfig = useKDSStore((s) => s.kdsDisplayConfig);
  const fetchKDSDisplay = useKDSStore((s) => s.fetchKDSDisplay);

  // Filter to KDS stations
  const kdsStations = useMemo(
    () => (allStations ?? []).filter((s) => s.station_type === "kds"),
    [allStations],
  );

  // When the current device itself is a KDS station, only show that station's
  // settings (no tab bar). When on a non-KDS device, show all KDS tabs.
  const isKDSDevice = selectedStation?.station_type === "kds";

  // Active tab index — auto-select the current KDS station if applicable.
  // Uses a ref to avoid re-selecting after the initial match is found.
  const [activeStationIdx, setActiveStationIdx] = useState(0);
  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (hasAutoSelected.current) return;
    if (isKDSDevice && selectedStation?.id && kdsStations.length > 0) {
      const idx = kdsStations.findIndex((s) => s.id === selectedStation.id);
      if (idx >= 0) {
        setActiveStationIdx(idx);
        hasAutoSelected.current = true;
      }
    }
  }, [isKDSDevice, selectedStation?.id, kdsStations]);

  // Non-KDS devices always show all tabs starting at index 0; ensure the
  // auto-select ref doesn't lock us out of switching away from index 0.
  useEffect(() => {
    if (!isKDSDevice) hasAutoSelected.current = false;
  }, [isKDSDevice]);

  const activeStation = kdsStations[activeStationIdx];

  // Fetch display config when station tab changes
  useEffect(() => {
    if (activeStation?.id) {
      fetchKDSDisplay(activeStation.id);
    }
  }, [activeStation?.id, fetchKDSDisplay]);

  const workflowMode = kdsConfig.workflowMode ?? "3-step";
  const tapMode = kdsConfig.ticketTapMode ?? "double-tap";

  const setWorkflowMode = async (mode: KdsConfig["workflowMode"]) => {
    if (!selectedStore?.id) return;
    updateConfig("kds", { workflowMode: mode });
    useStoreSettingsStore.getState().setSelectedStore({
      ...selectedStore,
      kds_workflow_mode: mode,
    });
    await supabase
      .from("locations")
      .update({ kds_workflow_mode: mode })
      .eq("id", selectedStore.id);
    if (mode === "2-step") {
      await supabase.rpc("migrate_pending_to_preparing", {
        p_location_id: selectedStore.id,
      });
    }
  };

  // ── Logout state & handlers ──────────────────────────────────────
  const { signOut } = useClerk();
  const { markVoluntaryLogout } = useSessionKick();
  const stationSessionId = useStoreSettingsStore((s) => s.stationSessionId);
  const clearStationSession = useStoreSettingsStore(
    (s) => s.clearStationSession,
  );
  const clearSelectedStore = useStoreSettingsStore((s) => s.clearSelectedStore);

  const [showLogoutPinGate, setShowLogoutPinGate] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleEndStationSession = async () => {
    setIsLoggingOut(true);
    markVoluntaryLogout();
    try {
      if (stationSessionId && selectedStore) {
        await supabase.rpc("pos_staff_logout", {
          p_session_id: stationSessionId,
          p_location_id: selectedStore.id,
          p_pin_code: "",
          p_device_id: getDeviceId(),
          p_clock_out: false,
        });
      }
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
      if (stationSessionId && selectedStore) {
        await supabase.rpc("pos_staff_logout", {
          p_session_id: stationSessionId,
          p_location_id: selectedStore.id,
          p_pin_code: "",
          p_device_id: getDeviceId(),
          p_clock_out: false,
        });
      }
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

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.screen,
        paddingHorizontal: s(14),
        paddingVertical: s(10),
      }}
    >
      {/* Page Header */}
      <View style={{ marginBottom: s(2) }}>
        <Text
          style={{ fontSize: s(15), fontWeight: "700", color: colors.heading }}
        >
          Kitchen Display (KDS)
        </Text>
        <Text style={{ fontSize: s(11), color: colors.label, marginTop: s(1) }}>
          Configure how kitchen tickets flow, look, and behave on the KDS
          screen.
        </Text>
      </View>

      <View
        style={{
          height: 1,
          backgroundColor: colors.border,
          marginVertical: s(10),
        }}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: s(24) }}
      >
        {/* ── Station Tabs ─────────────────────────────────────────── */}
        {kdsStations.length > 0 && (
          <>
            <SectionHeader title="Per-Station Settings" />
            {isKDSDevice ? (
              <Text
                style={{
                  fontSize: s(11),
                  color: colors.muted,
                  marginBottom: s(8),
                  paddingHorizontal: s(2),
                }}
              >
                Configuring settings for this KDS station (
                {activeStation?.station_name}).
              </Text>
            ) : (
              <Text
                style={{
                  fontSize: s(11),
                  color: colors.muted,
                  marginBottom: s(8),
                  paddingHorizontal: s(2),
                }}
              >
                Select a KDS station to configure its display, sound, and server
                name settings.
              </Text>
            )}
            {!isKDSDevice && (
              <View
                style={{
                  flexDirection: "row",
                  gap: s(6),
                  marginBottom: s(12),
                  flexWrap: "wrap",
                }}
              >
                {kdsStations.map((station, idx) => {
                  const isActive = idx === activeStationIdx;
                  return (
                    <TouchableOpacity
                      key={station.id}
                      onPress={() => setActiveStationIdx(idx)}
                      style={{
                        paddingHorizontal: s(14),
                        paddingVertical: s(8),
                        borderRadius: s(20),
                        backgroundColor: isActive ? colors.teal : colors.card,
                        borderWidth: 1,
                        borderColor: isActive
                          ? colors.teal + "50"
                          : colors.border,
                      }}
                    >
                      <Text
                        style={{
                          color: isActive ? colors.onSolid : colors.heading,
                          fontSize: s(12),
                          fontWeight: isActive ? "700" : "500",
                        }}
                      >
                        {station.station_name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Active Station Panel */}
            {activeStation && (
              <View
                style={{
                  backgroundColor: colors.card,
                  borderRadius: s(10),
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: s(12),
                  marginBottom: s(16),
                }}
              >
                <StationDisplayPanel
                  station={activeStation}
                  displayId={kdsDisplayId}
                  displayConfig={kdsDisplayConfig}
                  onRefresh={fetchKDSDisplay}
                  supabase={supabase}
                  selectedStationId={activeStation.id}
                />
              </View>
            )}
          </>
        )}

        {/* ── Ticket Printer (this KDS device only) ────────────────── */}
        {isKDSDevice && <KdsTicketPrinterSection />}

        {/* ── Global Settings ──────────────────────────────────────── */}
        <SectionHeader title="Global Settings" />
        <Text
          style={{
            fontSize: s(11),
            color: colors.muted,
            marginBottom: s(8),
            paddingHorizontal: s(2),
          }}
        >
          These settings apply to all KDS stations at this location.
        </Text>

        {/* ── Ticket Interaction ───────────────────────────────────── */}
        <SectionHeader title="Ticket Interaction" />
        <Text
          style={{
            fontSize: s(11),
            color: colors.muted,
            marginBottom: s(8),
            paddingHorizontal: s(2),
          }}
        >
          How a cook acts on a ticket. Double-tap bumps directly; single-select
          reveals Bump / Rush / Prioritize in the KDS header for the chosen
          ticket.
        </Text>
        <OptionCards
          options={[
            {
              value: "double-tap",
              label: "Double-Tap",
              desc: "Double-tap a ticket to bump it",
            },
            {
              value: "single-select",
              label: "Single-Select",
              desc: "Tap to select, act from header",
            },
          ]}
          value={tapMode}
          onChange={(v) => updateConfig("kds", { ticketTapMode: v })}
        />

        {/* ── Acknowledgment Mode ──────────────────────────────────── */}
        <SectionHeader title="Void / Refund Acknowledgment" />
        <Text
          style={{
            fontSize: s(11),
            color: colors.muted,
            marginBottom: s(8),
            paddingHorizontal: s(2),
          }}
        >
          How the KDS handles tickets with unacknowledged voided or refunded
          items.
        </Text>
        <OptionCards
          options={[
            {
              value: "block-advance",
              label: "Block Advance",
              desc: "Cook must tap each item to acknowledge before bumping",
            },
            {
              value: "ack-on-advance",
              label: "Auto-Ack on Bump",
              desc: "Bumping auto-acknowledges all & advances the ticket",
            },
          ]}
          value={kdsConfig.acknowledgmentMode ?? "block-advance"}
          onChange={(v) => updateConfig("kds", { acknowledgmentMode: v })}
        />

        {/* ── Workflow Mode ────────────────────────────────────────── */}
        <SectionHeader title="Workflow Mode" />
        <Text
          style={{
            fontSize: s(11),
            color: colors.muted,
            marginBottom: s(8),
            paddingHorizontal: s(2),
          }}
        >
          3-Step requires cooks to acknowledge orders before cooking. 2-Step
          skips the Pending stage.
        </Text>
        <OptionCards
          options={[
            {
              value: "3-step",
              label: "3-Step",
              desc: "Pending → Cooking → Served",
            },
            { value: "2-step", label: "2-Step", desc: "Cooking → Served" },
          ]}
          value={workflowMode}
          onChange={(v) => setWorkflowMode(v)}
        />

        {/* ── Auto-Fire (3-step only) ──────────────────────────────── */}
        {workflowMode !== "2-step" && (
          <>
            <SectionHeader title="Auto-Fire" />
            <ToggleRow
              label="Auto-Fire Pending Courses"
              value={kdsConfig.autoFireEnabled ?? false}
              onToggle={(v) => updateConfig("kds", { autoFireEnabled: v })}
            />
            {kdsConfig.autoFireEnabled && (
              <StepperRow
                label="Delay before auto-fire"
                value={kdsConfig.autoFireDelayMinutes ?? 5}
                min={1}
                max={30}
                suffix=" min"
                onChange={(v) =>
                  updateConfig("kds", { autoFireDelayMinutes: v })
                }
              />
            )}
          </>
        )}

        {/* ── Layout ───────────────────────────────────────────────── */}
        <SectionHeader title="Layout" />
        <View style={{ marginBottom: s(8) }}>
          <Text
            style={{
              fontSize: s(11),
              color: colors.muted,
              marginBottom: s(6),
              paddingHorizontal: s(2),
            }}
          >
            Served Tickets Sort
          </Text>
          <OptionCards
            options={[
              {
                value: "newest-first",
                label: "Newest First",
                desc: "Most recently served on top",
              },
              {
                value: "oldest-first",
                label: "Oldest First",
                desc: "Earliest served on top",
              },
            ]}
            value={kdsConfig.servedOrderSort ?? "newest-first"}
            onChange={(v) => updateConfig("kds", { servedOrderSort: v })}
          />
        </View>

        {/* ── Display ──────────────────────────────────────────────── */}
        <SectionHeader title="Display" />
        <ToggleRow
          label="Display Seat Numbers"
          value={kdsConfig.displaySeatNumbers ?? false}
          onToggle={(v) => updateConfig("kds", { displaySeatNumbers: v })}
        />
        <ToggleRow
          label="Display Guest Count"
          value={kdsConfig.displayGuestCount ?? false}
          onToggle={(v) => updateConfig("kds", { displayGuestCount: v })}
        />
        <ToggleRow
          label="Highlight Item Notes"
          value={kdsConfig.highlightNotes ?? false}
          onToggle={(v) => updateConfig("kds", { highlightNotes: v })}
        />
        <ToggleRow
          label="Display Exclusions at Top"
          value={kdsConfig.displayExclusionsAtTop ?? false}
          onToggle={(v) => updateConfig("kds", { displayExclusionsAtTop: v })}
        />
        <ToggleRow
          label="Hide Done Items"
          value={kdsConfig.hideDoneItems ?? false}
          onToggle={(v) => updateConfig("kds", { hideDoneItems: v })}
        />

        {/* ── Item Formatting ──────────────────────────────────────── */}
        <SectionHeader title="Item Formatting" />
        <View style={{ marginBottom: s(8) }}>
          <Text
            style={{
              fontSize: s(11),
              color: colors.muted,
              marginBottom: s(6),
              paddingHorizontal: s(2),
            }}
          >
            Show Modifier Group Name
          </Text>
          <OptionCards
            options={MODIFIER_GROUP_OPTIONS}
            value={kdsConfig.displayModifierGroupName ?? "for_group_priced"}
            onChange={(v) =>
              updateConfig("kds", { displayModifierGroupName: v })
            }
          />
        </View>
        <ToggleRow
          label="Alphabetically Sort Items"
          value={kdsConfig.alphabeticalSort ?? false}
          onToggle={(v) => updateConfig("kds", { alphabeticalSort: v })}
        />
        <ToggleRow
          label="Aggregate Identical Items"
          subtitle="Merge items with same name, modifiers, and notes"
          value={kdsConfig.aggregateIdenticalItems ?? false}
          onToggle={(v) => updateConfig("kds", { aggregateIdenticalItems: v })}
        />
        <ToggleRow
          label="Aggregate to Existing Tickets"
          subtitle="Single Ticket Mode"
          value={kdsConfig.aggregateToExistingTickets ?? false}
          onToggle={(v) =>
            updateConfig("kds", { aggregateToExistingTickets: v })
          }
        />

        {/* ── New Order Position ───────────────────────────────────── */}
        <SectionHeader title="New Orders" />
        <View style={{ marginBottom: s(8) }}>
          <Text
            style={{
              fontSize: s(11),
              color: colors.muted,
              marginBottom: s(6),
              paddingHorizontal: s(2),
            }}
          >
            Where new orders appear on the board
          </Text>
          <OptionCards
            options={[
              {
                value: "left",
                label: "Left Side",
                desc: "Newest orders on the left",
              },
              {
                value: "right",
                label: "Right Side",
                desc: "Newest orders on the right",
              },
            ]}
            value={kdsConfig.newOrderPosition ?? "right"}
            onChange={(v) => updateConfig("kds", { newOrderPosition: v })}
          />
        </View>

        {/* ── Ticket Color Thresholds ──────────────────────────────── */}
        <SectionHeader title="Ticket Color Thresholds" />
        <StepperRow
          label="Yellow (Warning)"
          value={kdsConfig.yellowThresholdMinutes ?? 5}
          min={1}
          max={(kdsConfig.orangeThresholdMinutes ?? 10) - 1}
          suffix="m"
          onChange={(v) => updateConfig("kds", { yellowThresholdMinutes: v })}
        />
        <StepperRow
          label="Orange (Late)"
          value={kdsConfig.orangeThresholdMinutes ?? 10}
          min={(kdsConfig.yellowThresholdMinutes ?? 5) + 1}
          max={(kdsConfig.redThresholdMinutes ?? 15) - 1}
          suffix="m"
          onChange={(v) => updateConfig("kds", { orangeThresholdMinutes: v })}
        />
        <StepperRow
          label="Red (Critical)"
          value={kdsConfig.redThresholdMinutes ?? 15}
          min={(kdsConfig.orangeThresholdMinutes ?? 10) + 1}
          max={60}
          suffix="m"
          onChange={(v) => updateConfig("kds", { redThresholdMinutes: v })}
        />

        {/* ── About & Updates ──────────────────────────────────────── */}
        <KdsUpdateSection />

        {/* ── Log Out (requires manager PIN) ── */}
        {isKDSDevice && (
          <>
            <View
              style={{
                height: 1,
                backgroundColor: colors.border,
                marginVertical: s(16),
              }}
            />
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: s(12),
                borderWidth: 1,
                borderColor: colors.border,
                padding: s(14),
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
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: s(10),
                  }}
                >
                  <View
                    style={{
                      width: s(32),
                      height: s(32),
                      borderRadius: s(8),
                      backgroundColor: colors.danger + "15",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <LogOut size={s(16)} color={colors.danger} />
                  </View>
                  <View>
                    <Text
                      style={{
                        fontSize: s(13),
                        fontWeight: "700",
                        color: colors.heading,
                      }}
                    >
                      Log Out
                    </Text>
                    <Text style={{ fontSize: s(11), color: colors.label }}>
                      Requires manager PIN
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setShowLogoutPinGate(true)}
                  disabled={isLoggingOut}
                  style={{
                    paddingHorizontal: s(14),
                    paddingVertical: s(7),
                    backgroundColor: colors.danger + "15",
                    borderWidth: 1,
                    borderColor: colors.danger + "30",
                    borderRadius: s(8),
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(13),
                      fontWeight: "600",
                      color: colors.danger,
                    }}
                  >
                    Log Out
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
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
    </View>
  );
};

export default KdsSettingsScreen;
