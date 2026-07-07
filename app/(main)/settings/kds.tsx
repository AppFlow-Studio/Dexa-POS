import { useToast } from "@/contexts/ToastContext";
import { useLocationStations } from "@/hooks/useLocationStations";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import KDSSoundService, {
    DEFAULT_SOUND_CONFIG,
    type KDSSoundConfig,
    type SoundPreset
} from "@/services/kds/kdsSoundService";
import { useKDSStore } from "@/stores/useKDSStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { KdsConfig } from "@/types/locationConfig";
import type { Station } from "@/types/station";
import { Minus, Play, Plus } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
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

  // Active tab index
  const [activeStationIdx, setActiveStationIdx] = useState(0);
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
      </ScrollView>
    </View>
  );
};

export default KdsSettingsScreen;
