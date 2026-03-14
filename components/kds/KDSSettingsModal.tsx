import { colors } from "@/lib/theme";
import KDSSoundService, {
  DEFAULT_SOUND_CONFIG,
  SOUND_PRESET_OPTIONS,
  type KDSSoundConfig,
  type SoundPreset,
} from "@/services/kds/kdsSoundService";
import { useKDSStore } from "@/stores/useKDSStore";
import { useStoreSettingsStore, type StoreSettings } from "@/stores/useStoreSettingsStore";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  ChevronDown,
  Minus,
  Play,
  Plus,
  Printer,
  Settings,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ─── Tab types ────────────────────────────────────────────────────
type SettingsTab = "general" | "printing";

// ─── Section Header ──────────────────────────────────────────────
const SectionHeader = ({ title }: { title: string }) => (
  <Text
    style={{
      color: colors.muted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
      marginTop: 16,
      marginBottom: 8,
      textTransform: "uppercase",
    }}
  >
    {title}
  </Text>
);

// ─── Toggle Row ──────────────────────────────────────────────────
const ToggleRow = ({
  label,
  subtitle,
  value,
  onToggle,
}: {
  label: string;
  subtitle?: string;
  value: boolean;
  onToggle: (val: boolean) => void;
}) => (
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
    <View style={{ flex: 1, marginRight: 12 }}>
      <Text style={{ color: "#fff", fontSize: 13, fontWeight: "500" }}>{label}</Text>
      {subtitle && (
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
      )}
    </View>
    <Switch
      value={value}
      onValueChange={onToggle}
      trackColor={{ false: colors.border, true: colors.teal }}
      thumbColor="#fff"
    />
  </View>
);

// ─── Dropdown Row ────────────────────────────────────────────────
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
  const [open, setOpen] = useState(false);
  const currentLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
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
      <Text style={{ color: "#fff", fontSize: 13, fontWeight: "500", flex: 1 }}>{label}</Text>
      <View>
        <TouchableOpacity
          onPress={() => setOpen(!open)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.skeleton,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 12, marginRight: 4 }}>{currentLabel}</Text>
          <ChevronDown size={14} color={colors.muted} />
        </TouchableOpacity>
        {open && (
          <View
            style={{
              position: "absolute",
              top: 36,
              right: 0,
              zIndex: 50,
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 8,
              elevation: 10,
              minWidth: 140,
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
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: opt.value === value ? "rgba(59,130,246,0.15)" : "transparent",
                }}
              >
                <Text
                  style={{
                    color: opt.value === value ? colors.info : "#fff",
                    fontSize: 12,
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
  );
}

// ─── Sound Preset Row ────────────────────────────────────────────
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
  const [open, setOpen] = useState(false);
  const currentLabel = SOUND_PRESET_OPTIONS.find((o) => o.value === value)?.label ?? value;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: colors.label, fontSize: 12, flex: 1 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View>
          <TouchableOpacity
            onPress={() => setOpen(!open)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.skeleton,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 11, marginRight: 4 }}>{currentLabel}</Text>
            <ChevronDown size={12} color={colors.muted} />
          </TouchableOpacity>
          {open && (
            <View
              style={{
                position: "absolute",
                top: 30,
                right: 0,
                zIndex: 50,
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 8,
                elevation: 10,
                minWidth: 100,
              }}
            >
              {SOUND_PRESET_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    backgroundColor: opt.value === value ? "rgba(59,130,246,0.15)" : "transparent",
                  }}
                >
                  <Text
                    style={{
                      color: opt.value === value ? colors.info : "#fff",
                      fontSize: 11,
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
            backgroundColor: colors.skeleton,
            padding: 5,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: testDisabled ? 0.4 : 1,
          }}
        >
          <Play size={12} color={colors.info} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Stepper Row ─────────────────────────────────────────────────
const StepperRow = ({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (val: number) => void;
}) => (
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
    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "500", flex: 1 }}>{label}</Text>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <TouchableOpacity
        onPress={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        style={{
          backgroundColor: colors.skeleton,
          width: 28,
          height: 28,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: colors.border,
          opacity: value <= min ? 0.4 : 1,
        }}
      >
        <Minus size={14} color="#fff" />
      </TouchableOpacity>
      <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600", minWidth: 36, textAlign: "center" }}>
        {value}{suffix ?? ""}
      </Text>
      <TouchableOpacity
        onPress={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        style={{
          backgroundColor: colors.skeleton,
          width: 28,
          height: 28,
          borderRadius: 6,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: colors.border,
          opacity: value >= max ? 0.4 : 1,
        }}
      >
        <Plus size={14} color="#fff" />
      </TouchableOpacity>
    </View>
  </View>
);

// ─── Modifier group name options ─────────────────────────────────
const MODIFIER_GROUP_OPTIONS: { value: StoreSettings["kdsDisplayModifierGroupName"]; label: string }[] = [
  { value: "for_group_priced", label: "FOR GROUP PRICED" },
  { value: "always", label: "ALWAYS" },
  { value: "never", label: "NEVER" },
];

const ITEM_NAME_LINES_OPTIONS = [
  { value: 0, label: "UNLIMITED" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
];

// ─── Main Settings Modal ─────────────────────────────────────────
export interface KDSSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function KDSSettingsModal({ visible, onClose }: KDSSettingsModalProps) {
  const supabase = useSupabaseClient();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  // Store settings
  const updateField = useStoreSettingsStore((s) => s.updateField);
  const kdsDisplayModifierGroupName = useStoreSettingsStore((s) => s.kdsDisplayModifierGroupName);
  const kdsItemNameLines = useStoreSettingsStore((s) => s.kdsItemNameLines);
  const kdsDisplaySeatNumbers = useStoreSettingsStore((s) => s.kdsDisplaySeatNumbers);
  const kdsDisplayGuestCount = useStoreSettingsStore((s) => s.kdsDisplayGuestCount);
  const kdsAlphabeticalSort = useStoreSettingsStore((s) => s.kdsAlphabeticalSort);
  const kdsHighlightNotes = useStoreSettingsStore((s) => s.kdsHighlightNotes);
  const kdsDisplayExclusionsAtTop = useStoreSettingsStore((s) => s.kdsDisplayExclusionsAtTop);
  const kdsAggregateIdenticalItems = useStoreSettingsStore((s) => s.kdsAggregateIdenticalItems);
  const kdsHideDoneItems = useStoreSettingsStore((s) => s.kdsHideDoneItems);
  const kdsAggregateToExistingTickets = useStoreSettingsStore((s) => s.kdsAggregateToExistingTickets);
  const kdsAutoFireEnabled = useStoreSettingsStore((s) => s.kdsAutoFireEnabled);
  const kdsAutoFireDelayMinutes = useStoreSettingsStore((s) => s.kdsAutoFireDelayMinutes);
  const kdsYellowThresholdMinutes = useStoreSettingsStore((s) => s.kdsYellowThresholdMinutes);
  const kdsOrangeThresholdMinutes = useStoreSettingsStore((s) => s.kdsOrangeThresholdMinutes);
  const kdsRedThresholdMinutes = useStoreSettingsStore((s) => s.kdsRedThresholdMinutes);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);

  // KDS display (sound config lives in Supabase per-display)
  const kdsDisplayId = useKDSStore((s) => s.kdsDisplayId);
  const kdsDisplayConfig = useKDSStore((s) => s.kdsDisplayConfig);
  const fetchKDSDisplay = useKDSStore((s) => s.fetchKDSDisplay);

  // Sound state (local, synced from kdsDisplayConfig)
  const [soundOnNewOrder, setSoundOnNewOrder] = useState(false);
  const [soundConfig, setSoundConfig] = useState<KDSSoundConfig>({ ...DEFAULT_SOUND_CONFIG });
  const [soundServicePreview] = useState(() => new KDSSoundService());
  const [isSavingSound, setIsSavingSound] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);

  // Sync sound state from KDS display config
  useEffect(() => {
    if (kdsDisplayConfig) {
      setSoundOnNewOrder(kdsDisplayConfig.soundOnNewOrder ?? false);
      if (kdsDisplayConfig.soundConfig) {
        setSoundConfig(kdsDisplayConfig.soundConfig);
      }
    }
  }, [kdsDisplayConfig]);

  // Init/dispose preview sound service
  useEffect(() => {
    soundServicePreview.init().then(() => setPreviewReady(true));
    return () => {
      soundServicePreview.dispose();
      setPreviewReady(false);
    };
  }, []);

  // Save sound config to Supabase
  const saveSoundConfig = useCallback(
    async (newSoundOn: boolean, newConfig: KDSSoundConfig) => {
      if (!kdsDisplayId) return;
      setIsSavingSound(true);
      try {
        await supabase
          .from("kds_displays")
          .update({
            sound_on_new_order: newSoundOn,
            sound_config: newConfig as any,
          })
          .eq("id", kdsDisplayId);

        if (selectedStation?.id) {
          fetchKDSDisplay(selectedStation.id);
        }
      } catch (err) {
        console.error("[KDSSettings] saveSoundConfig error:", err);
      } finally {
        setIsSavingSound(false);
      }
    },
    [kdsDisplayId, supabase, selectedStation?.id, fetchKDSDisplay],
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

  const { width: screenW, height: screenH } = Dimensions.get("window");
  const modalWidth = Math.min(screenW * 0.5, 500);
  const modalHeight = screenH * 0.85;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop — absolute fill so tapping outside closes */}
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" }}>
        <Pressable
          onPress={onClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {/* Modal content */}
        <View
          style={{
            width: modalWidth,
            height: modalHeight,
            backgroundColor: colors.panel,
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 8,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Settings size={18} color={colors.teal} />
                <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Settings</Text>
                <View
                  style={{
                    backgroundColor: colors.teal,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 6,
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>KDS</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  padding: 6,
                  backgroundColor: colors.skeleton,
                  borderRadius: 8,
                }}
              >
                <X size={16} color={colors.label} />
              </TouchableOpacity>
            </View>

            {/* Tab Bar */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["general", "printing"] as const).map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                      borderRadius: 20,
                      backgroundColor: isActive ? colors.teal : colors.skeleton,
                    }}
                  >
                    <Text
                      style={{
                        color: isActive ? "#fff" : colors.label,
                        fontSize: 13,
                        fontWeight: isActive ? "700" : "500",
                        textTransform: "capitalize",
                      }}
                    >
                      {tab}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Content */}
          {activeTab === "general" ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {/* RECEIPTS Section */}
              <SectionHeader title="Receipts" />

              <DropdownRow
                label="Display Modifier Group Name"
                value={kdsDisplayModifierGroupName}
                options={MODIFIER_GROUP_OPTIONS}
                onChange={(val) => updateField("kdsDisplayModifierGroupName", val)}
              />

              <DropdownRow
                label="Number of Item Name Lines"
                value={String(kdsItemNameLines)}
                options={ITEM_NAME_LINES_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                onChange={(val) => updateField("kdsItemNameLines", Number(val))}
              />

              <ToggleRow
                label="Display Seat Numbers assigned to Items"
                value={kdsDisplaySeatNumbers}
                onToggle={(val) => updateField("kdsDisplaySeatNumbers", val)}
              />

              <ToggleRow
                label="Display Guests Count"
                value={kdsDisplayGuestCount}
                onToggle={(val) => updateField("kdsDisplayGuestCount", val)}
              />

              <ToggleRow
                label="Alphabetically Sort Receipt Items"
                value={kdsAlphabeticalSort}
                onToggle={(val) => updateField("kdsAlphabeticalSort", val)}
              />

              <ToggleRow
                label="Highlight Item/Order Notes"
                value={kdsHighlightNotes}
                onToggle={(val) => updateField("kdsHighlightNotes", val)}
              />

              <ToggleRow
                label="Aggregate Identical Items"
                subtitle="Merge items with same name, modifiers, and notes"
                value={kdsAggregateIdenticalItems}
                onToggle={(val) => updateField("kdsAggregateIdenticalItems", val)}
              />

              <ToggleRow
                label="Aggregate Items to Existing Tickets"
                subtitle="Single Ticket Mode"
                value={kdsAggregateToExistingTickets}
                onToggle={(val) => updateField("kdsAggregateToExistingTickets", val)}
              />

              {/* SOUND Section */}
              <SectionHeader title="Sound" />

              {!kdsDisplayId ? (
                <Text style={{ color: colors.muted, fontSize: 12, fontStyle: "italic", marginBottom: 8 }}>
                  No KDS display configured for this station. Sound settings are per-display.
                </Text>
              ) : (
                <>
                  <ToggleRow
                    label="Sound on New Order"
                    value={soundOnNewOrder}
                    onToggle={handleSoundToggle}
                  />
                  {soundOnNewOrder && (
                    <View style={{ marginLeft: 8 }}>
                      <SoundPresetRow
                        label="POS"
                        value={soundConfig.pos}
                        onChange={(v) => handleSoundPresetChange("pos", v)}
                        onTest={(v) => soundServicePreview.playPreview(v)}
                        testDisabled={!previewReady}
                      />
                      <SoundPresetRow
                        label="Online"
                        value={soundConfig.online}
                        onChange={(v) => handleSoundPresetChange("online", v)}
                        onTest={(v) => soundServicePreview.playPreview(v)}
                        testDisabled={!previewReady}
                      />
                      <SoundPresetRow
                        label="Kiosk"
                        value={soundConfig.kiosk}
                        onChange={(v) => handleSoundPresetChange("kiosk", v)}
                        onTest={(v) => soundServicePreview.playPreview(v)}
                        testDisabled={!previewReady}
                      />
                      <SoundPresetRow
                        label="Third-party"
                        value={soundConfig.third_party}
                        onChange={(v) => handleSoundPresetChange("third_party", v)}
                        onTest={(v) => soundServicePreview.playPreview(v)}
                        testDisabled={!previewReady}
                      />
                      <SoundPresetRow
                        label="Default"
                        value={soundConfig.default}
                        onChange={(v) => handleSoundPresetChange("default", v)}
                        onTest={(v) => soundServicePreview.playPreview(v)}
                        testDisabled={!previewReady}
                      />
                      {isSavingSound && (
                        <Text style={{ color: colors.muted, fontSize: 10, marginTop: 4 }}>Saving...</Text>
                      )}
                    </View>
                  )}
                </>
              )}

              {/* OTHER Section */}
              <SectionHeader title="Other" />

              <ToggleRow
                label="Auto-Fire Pending Courses"
                value={kdsAutoFireEnabled}
                onToggle={(val) => updateField("kdsAutoFireEnabled", val)}
              />
              {kdsAutoFireEnabled && (
                <StepperRow
                  label="Auto-Fire Delay"
                  value={kdsAutoFireDelayMinutes}
                  min={1}
                  max={30}
                  step={1}
                  suffix="m"
                  onChange={(val) => updateField("kdsAutoFireDelayMinutes", val)}
                />
              )}

              {/* TICKET COLOR THRESHOLDS Section */}
              <SectionHeader title="Ticket Color Thresholds" />

              <StepperRow
                label="Yellow (Warning)"
                value={kdsYellowThresholdMinutes}
                min={1}
                max={kdsOrangeThresholdMinutes - 1}
                step={1}
                suffix="m"
                onChange={(val) => updateField("kdsYellowThresholdMinutes", val)}
              />

              <StepperRow
                label="Orange (Late)"
                value={kdsOrangeThresholdMinutes}
                min={kdsYellowThresholdMinutes + 1}
                max={kdsRedThresholdMinutes - 1}
                step={1}
                suffix="m"
                onChange={(val) => updateField("kdsOrangeThresholdMinutes", val)}
              />

              <StepperRow
                label="Red (Critical)"
                value={kdsRedThresholdMinutes}
                min={kdsOrangeThresholdMinutes + 1}
                max={60}
                step={1}
                suffix="m"
                onChange={(val) => updateField("kdsRedThresholdMinutes", val)}
              />
            </ScrollView>
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
              <Printer size={32} color={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 13, marginTop: 12 }}>
                Kitchen ticket print format settings coming soon.
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
