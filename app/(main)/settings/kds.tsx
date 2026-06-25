import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { KdsConfig } from "@/types/locationConfig";
import { Minus, Plus } from "lucide-react-native";
import React from "react";
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
        <Text style={{ fontSize: s(13), color: colors.heading, marginBottom: subtitle ? s(2) : 0 }}>
          {label}
        </Text>
        {subtitle && <Text style={{ fontSize: s(11), color: colors.muted }}>{subtitle}</Text>}
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
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: s(12), color: colors.label, fontWeight: "500" }}>{label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
          <TouchableOpacity
            onPress={() => onChange(Math.max(min, value - 1))}
            style={{ backgroundColor: colors.panel, width: s(28), height: s(28), borderRadius: s(6), alignItems: "center", justifyContent: "center" }}
          >
            <Minus size={s(12)} color={colors.heading} />
          </TouchableOpacity>
          <Text style={{ fontSize: s(12), fontWeight: "700", color: colors.teal, minWidth: s(40), textAlign: "center" }}>
            {value}
            {suffix ?? ""}
          </Text>
          <TouchableOpacity
            onPress={() => onChange(Math.min(max, value + 1))}
            style={{ backgroundColor: colors.panel, width: s(28), height: s(28), borderRadius: s(6), alignItems: "center", justifyContent: "center" }}
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
            <Text style={{ fontSize: s(12), fontWeight: "700", color: isSelected ? colors.teal : colors.heading }}>
              {opt.label}
            </Text>
            {opt.desc && (
              <Text style={{ fontSize: s(10), marginTop: s(2), color: isSelected ? colors.teal + "CC" : colors.muted }}>
                {opt.desc}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// SCREEN
// ---------------------------------------------------------------------------

const MODIFIER_GROUP_OPTIONS: { value: KdsConfig["displayModifierGroupName"]; label: string }[] = [
  { value: "for_group_priced", label: "Priced" },
  { value: "always", label: "Always" },
  { value: "never", label: "Never" },
];

const KdsSettingsScreen = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const supabase = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((store) => store.selectedStore);
  const kdsConfig = useLocationConfigStore((store) => store.config.kds);
  const updateConfig = useLocationConfigStore((store) => store.updateConfig);

  const workflowMode = kdsConfig.workflowMode ?? "3-step";
  const tapMode = kdsConfig.ticketTapMode ?? "double-tap";

  const setWorkflowMode = async (mode: KdsConfig["workflowMode"]) => {
    if (!selectedStore?.id) return;
    updateConfig("kds", { workflowMode: mode });
    useStoreSettingsStore.getState().setSelectedStore({
      ...selectedStore,
      kds_workflow_mode: mode,
    });
    await supabase.from("locations").update({ kds_workflow_mode: mode }).eq("id", selectedStore.id);
    if (mode === "2-step") {
      await supabase.rpc("migrate_pending_to_preparing", { p_location_id: selectedStore.id });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, paddingHorizontal: s(14), paddingVertical: s(10) }}>
      {/* Page Header */}
      <View style={{ marginBottom: s(2) }}>
        <Text style={{ fontSize: s(15), fontWeight: "700", color: colors.heading }}>Kitchen Display (KDS)</Text>
        <Text style={{ fontSize: s(11), color: colors.label, marginTop: s(1) }}>
          Configure how kitchen tickets flow, look, and behave on the KDS screen.
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: s(10) }} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: s(24) }}>
        {/* ── Ticket Interaction ───────────────────────────────────── */}
        <SectionHeader title="Ticket Interaction" />
        <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(8), paddingHorizontal: s(2) }}>
          How a cook acts on a ticket. Double-tap bumps directly; single-select reveals Bump / Rush / Prioritize in the KDS header for the chosen ticket.
        </Text>
        <OptionCards
          options={[
            { value: "double-tap", label: "Double-Tap", desc: "Double-tap a ticket to bump it" },
            { value: "single-select", label: "Single-Select", desc: "Tap to select, act from header" },
          ]}
          value={tapMode}
          onChange={(v) => updateConfig("kds", { ticketTapMode: v })}
        />

        {/* ── Workflow Mode ────────────────────────────────────────── */}
        <SectionHeader title="Workflow Mode" />
        <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(8), paddingHorizontal: s(2) }}>
          3-Step requires cooks to acknowledge orders before cooking. 2-Step skips the Pending stage.
        </Text>
        <OptionCards
          options={[
            { value: "3-step", label: "3-Step", desc: "Pending → Cooking → Served" },
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
                onChange={(v) => updateConfig("kds", { autoFireDelayMinutes: v })}
              />
            )}
          </>
        )}

        {/* ── Layout ───────────────────────────────────────────────── */}
        <SectionHeader title="Layout" />
        <View style={{ marginBottom: s(8) }}>
          <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(6), paddingHorizontal: s(2) }}>
            New Orders Appear
          </Text>
          <OptionCards
            options={[
              { value: "left", label: "Left", desc: "Newest first" },
              { value: "right", label: "Right", desc: "Newest last" },
            ]}
            value={kdsConfig.newOrderPosition ?? "right"}
            onChange={(v) => updateConfig("kds", { newOrderPosition: v })}
          />
        </View>
        <View style={{ marginBottom: s(8) }}>
          <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(6), paddingHorizontal: s(2) }}>
            Served Tickets Sort
          </Text>
          <OptionCards
            options={[
              { value: "newest-first", label: "Newest First", desc: "Most recently served on top" },
              { value: "oldest-first", label: "Oldest First", desc: "Earliest served on top" },
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
          <Text style={{ fontSize: s(11), color: colors.muted, marginBottom: s(6), paddingHorizontal: s(2) }}>
            Show Modifier Group Name
          </Text>
          <OptionCards
            options={MODIFIER_GROUP_OPTIONS}
            value={kdsConfig.displayModifierGroupName ?? "for_group_priced"}
            onChange={(v) => updateConfig("kds", { displayModifierGroupName: v })}
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
          onToggle={(v) => updateConfig("kds", { aggregateToExistingTickets: v })}
        />

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
