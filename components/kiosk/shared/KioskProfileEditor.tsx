import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { toastService } from "@/lib/toastService";
import type { KioskConfig, KioskOrientation, KioskTemplateId } from "@/types/kiosk";
import { Check, RefreshCw } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

/**
 * On-device editor for the kiosk profile (kiosk_profiles row) — the same
 * options the web dashboard configures, editable on the tablet behind the
 * manager PIN. Media (logo / images / video) stays web-only (no on-device
 * upload) and is shown read-only.
 *
 *   Sync  → pull the latest profile from the backend (refetch + re-normalize).
 *   Save  → write the edited fields back to kiosk_profiles.
 *
 * Edits live in a local `draft`; a background poll only refreshes the form when
 * there are no unsaved changes, so it never clobbers what the manager is typing.
 */

type EditableProfile = Pick<
  KioskConfig,
  | "profileName"
  | "templateId"
  | "orientation"
  | "welcomeMessage"
  | "pickupNumberPrefix"
  | "fontFamily"
  | "primaryColor"
  | "secondaryColor"
  | "accentColor"
  | "backgroundColor"
  | "textColor"
  | "headerTextColor"
  | "idleTimeoutSeconds"
  | "cartResetTimeoutSeconds"
  | "tipScreenEnabled"
  | "autoPrintReceipt"
  | "receiptEmailPrompt"
  | "receiptSmsPrompt"
  | "loyaltyEnrollmentEnabled"
  | "showCalorieInfo"
  | "showAllergens"
  | "isActive"
>;

function extractEditable(c: KioskConfig): EditableProfile {
  return {
    profileName: c.profileName,
    templateId: c.templateId,
    orientation: c.orientation,
    welcomeMessage: c.welcomeMessage,
    pickupNumberPrefix: c.pickupNumberPrefix,
    fontFamily: c.fontFamily,
    primaryColor: c.primaryColor,
    secondaryColor: c.secondaryColor,
    accentColor: c.accentColor,
    backgroundColor: c.backgroundColor,
    textColor: c.textColor,
    headerTextColor: c.headerTextColor,
    idleTimeoutSeconds: c.idleTimeoutSeconds,
    cartResetTimeoutSeconds: c.cartResetTimeoutSeconds,
    tipScreenEnabled: c.tipScreenEnabled,
    autoPrintReceipt: c.autoPrintReceipt,
    receiptEmailPrompt: c.receiptEmailPrompt,
    receiptSmsPrompt: c.receiptSmsPrompt,
    loyaltyEnrollmentEnabled: c.loyaltyEnrollmentEnabled,
    showCalorieInfo: c.showCalorieInfo,
    showAllergens: c.showAllergens,
    isActive: c.isActive,
  };
}

const parsePresets = (text: string): number[] =>
  text
    .split(/[,\s]+/)
    .map((t) => parseInt(t, 10))
    .filter((n) => Number.isFinite(n) && n >= 0);

export function KioskProfileEditor({
  config,
  onRefreshKioskConfig,
}: {
  config: KioskConfig;
  onRefreshKioskConfig?: () => void | Promise<unknown>;
}) {
  const supabase = useSupabaseClient();

  const [draft, setDraft] = useState<EditableProfile>(() =>
    extractEditable(config),
  );
  // Tip presets edited as free text so a trailing comma/space is typable.
  const [tipPresetsText, setTipPresetsText] = useState(() =>
    config.tipPresets.join(", "),
  );
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const baseline = useMemo(() => extractEditable(config), [config]);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(baseline) ||
    JSON.stringify(parsePresets(tipPresetsText)) !==
      JSON.stringify(config.tipPresets);

  // Refresh the form from a background poll ONLY when there are no unsaved
  // edits — otherwise keep what the manager is typing.
  useEffect(() => {
    if (!dirty) {
      setDraft(extractEditable(config));
      setTipPresetsText(config.tipPresets.join(", "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const set = <K extends keyof EditableProfile>(
    key: K,
    value: EditableProfile[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));

  const handleSync = async () => {
    if (syncing || !onRefreshKioskConfig) return;
    setSyncing(true);
    try {
      await onRefreshKioskConfig();
      toastService.show({
        title: "Synced",
        message: "Kiosk settings refreshed from the web.",
        type: "success",
      });
    } catch {
      toastService.show({
        title: "Sync Failed",
        message: "Could not refresh settings. Check your connection.",
        type: "error",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        profile_name: draft.profileName.trim() || "Kiosk",
        template_id: draft.templateId,
        orientation: draft.orientation,
        welcome_message: draft.welcomeMessage,
        pickup_number_prefix: draft.pickupNumberPrefix,
        font_family: draft.fontFamily,
        primary_color: draft.primaryColor,
        secondary_color: draft.secondaryColor,
        accent_color: draft.accentColor,
        background_color: draft.backgroundColor,
        text_color: draft.textColor,
        header_text_color: draft.headerTextColor,
        idle_timeout_seconds: draft.idleTimeoutSeconds,
        cart_reset_timeout_seconds: draft.cartResetTimeoutSeconds,
        tip_screen_enabled: draft.tipScreenEnabled,
        tip_presets: parsePresets(tipPresetsText),
        auto_print_receipt: draft.autoPrintReceipt,
        receipt_email_prompt: draft.receiptEmailPrompt,
        receipt_sms_prompt: draft.receiptSmsPrompt,
        loyalty_enrollment_enabled: draft.loyaltyEnrollmentEnabled,
        show_calorie_info: draft.showCalorieInfo,
        show_allergens: draft.showAllergens,
        is_active: draft.isActive,
      };
      const { error } = await supabase
        .from("kiosk_profiles")
        .update(payload)
        .eq("id", config.id);
      if (error) throw error;

      // Pull the row back so the live kiosk re-normalizes from the saved values.
      await onRefreshKioskConfig?.();
      toastService.show({
        title: "Saved",
        message: "Kiosk settings updated.",
        type: "success",
      });
    } catch (err) {
      toastService.show({
        title: "Save Failed",
        message: err instanceof Error ? err.message : "Could not save settings.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Kiosk Profile
        </Text>
        {dirty ? (
          <Text className="text-[11px] font-semibold text-amber-600">
            Unsaved changes
          </Text>
        ) : null}
      </View>

      <View className="rounded-2xl border border-gray-200 px-4 py-3" style={{ gap: 14 }}>
        {/* Sync / Save actions */}
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={handleSync}
            disabled={syncing}
            className="flex-1 py-2.5 rounded-xl items-center flex-row justify-center border border-gray-200 bg-gray-50"
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#0D9488" />
            ) : (
              <RefreshCw size={14} color="#0D9488" />
            )}
            <Text className="text-sm font-bold text-teal-600 ml-1.5">
              Sync from web
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!dirty || saving}
            className={`flex-1 py-2.5 rounded-xl items-center flex-row justify-center border ${
              dirty && !saving
                ? "bg-teal-50 border-teal-300"
                : "bg-gray-50 border-gray-200"
            }`}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#0D9488" />
            ) : (
              <Check size={15} color={dirty ? "#0D9488" : "#9CA3AF"} />
            )}
            <Text
              className={`text-sm font-bold ml-1.5 ${
                dirty ? "text-teal-600" : "text-gray-400"
              }`}
            >
              Save changes
            </Text>
          </TouchableOpacity>
        </View>

        <Divider />

        {/* General */}
        <GroupLabel text="General" />
        <TextField
          label="Profile name"
          value={draft.profileName}
          onChangeText={(v) => set("profileName", v)}
        />
        <Segmented
          label="Template"
          options={[
            { value: "template_a", label: "A" },
            { value: "template_b", label: "B" },
            { value: "template_c", label: "C" },
          ]}
          value={draft.templateId}
          onChange={(v) => set("templateId", v as KioskTemplateId)}
        />
        <Segmented
          label="Orientation"
          options={[
            { value: "vertical", label: "Vertical" },
            { value: "horizontal", label: "Horizontal" },
          ]}
          value={draft.orientation}
          onChange={(v) => set("orientation", v as KioskOrientation)}
        />
        <TextField
          label="Welcome message"
          value={draft.welcomeMessage}
          onChangeText={(v) => set("welcomeMessage", v)}
        />
        <TextField
          label="Pickup number prefix"
          value={draft.pickupNumberPrefix}
          onChangeText={(v) => set("pickupNumberPrefix", v)}
          placeholder="e.g. A-"
        />
        <TextField
          label="Font family"
          value={draft.fontFamily}
          onChangeText={(v) => set("fontFamily", v)}
        />

        <Divider />

        {/* Theme */}
        <GroupLabel text="Theme" />
        <ColorField label="Primary" value={draft.primaryColor} onChangeText={(v) => set("primaryColor", v)} />
        <ColorField label="Background" value={draft.backgroundColor} onChangeText={(v) => set("backgroundColor", v)} />
        <ColorField label="Text" value={draft.textColor} onChangeText={(v) => set("textColor", v)} />
        <ColorField label="Header text" value={draft.headerTextColor} onChangeText={(v) => set("headerTextColor", v)} />
        <ColorField label="Secondary" value={draft.secondaryColor} onChangeText={(v) => set("secondaryColor", v)} />
        <ColorField label="Accent" value={draft.accentColor} onChangeText={(v) => set("accentColor", v)} />

        <Divider />

        {/* Timing */}
        <GroupLabel text="Timing" />
        <NumberField
          label="Idle timeout (seconds)"
          value={draft.idleTimeoutSeconds}
          onChangeNumber={(n) => set("idleTimeoutSeconds", n)}
        />
        <NumberField
          label="Cart reset timeout (seconds)"
          value={draft.cartResetTimeoutSeconds}
          onChangeNumber={(n) => set("cartResetTimeoutSeconds", n)}
        />

        <Divider />

        {/* Checkout */}
        <GroupLabel text="Checkout" />
        <ToggleRow label="Tip screen" value={draft.tipScreenEnabled} onChange={(v) => set("tipScreenEnabled", v)} />
        <TextField
          label="Tip presets (%)"
          value={tipPresetsText}
          onChangeText={setTipPresetsText}
          keyboardType="numbers-and-punctuation"
          placeholder="15, 18, 20, 25"
        />
        <ToggleRow label="Auto-print receipt" value={draft.autoPrintReceipt} onChange={(v) => set("autoPrintReceipt", v)} />
        <ToggleRow label="Email receipt prompt" value={draft.receiptEmailPrompt} onChange={(v) => set("receiptEmailPrompt", v)} />
        <ToggleRow label="SMS receipt prompt" value={draft.receiptSmsPrompt} onChange={(v) => set("receiptSmsPrompt", v)} />
        <ToggleRow label="Loyalty enrollment" value={draft.loyaltyEnrollmentEnabled} onChange={(v) => set("loyaltyEnrollmentEnabled", v)} />

        <Divider />

        {/* Menu display */}
        <GroupLabel text="Menu display" />
        <ToggleRow label="Show calories" value={draft.showCalorieInfo} onChange={(v) => set("showCalorieInfo", v)} />
        <ToggleRow label="Show allergens" value={draft.showAllergens} onChange={(v) => set("showAllergens", v)} />

        <Divider />

        {/* Status + read-only */}
        <GroupLabel text="Status" />
        <ToggleRow label="Profile active" value={draft.isActive} onChange={(v) => set("isActive", v)} />
        <ReadOnlyRow label="Profile ID" value={config.id} mono />
        <ReadOnlyRow label="Published" value={config.publishedAt ?? "Never"} />
        <ReadOnlyRow
          label="Media"
          value={`Logo ${config.logoUrl ? "set" : "none"} · edit on web`}
        />
      </View>
    </View>
  );
}

// ── Small field primitives (match the diagnostics screen styling) ──

function GroupLabel({ text }: { text: string }) {
  return (
    <Text className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
      {text}
    </Text>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: "#F1F1F1" }} />;
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numbers-and-punctuation";
}) {
  return (
    <View>
      <Text className="text-xs text-gray-500 mb-1">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
        className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-black"
      />
    </View>
  );
}

function NumberField({
  label,
  value,
  onChangeNumber,
}: {
  label: string;
  value: number;
  onChangeNumber: (n: number) => void;
}) {
  return (
    <View>
      <Text className="text-xs text-gray-500 mb-1">{label}</Text>
      <TextInput
        value={String(value)}
        onChangeText={(t) => onChangeNumber(parseInt(t, 10) || 0)}
        keyboardType="number-pad"
        placeholderTextColor="#9CA3AF"
        className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-black"
      />
    </View>
  );
}

function ColorField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View className="flex-row items-center">
      <Text className="text-xs text-gray-500 flex-1">{label}</Text>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          marginRight: 8,
          backgroundColor: /^#([0-9a-fA-F]{3,8})$/.test(value.trim())
            ? value.trim()
            : "#FFFFFF",
          borderWidth: 1,
          borderColor: "#E0E0E0",
        }}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="#000000"
        placeholderTextColor="#9CA3AF"
        className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-black"
        style={{ width: 120, fontFamily: "monospace" }}
      />
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-gray-700">{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: "#0D9488", false: "#E0E0E0" }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function ReadOnlyRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text
        className="text-sm font-medium text-gray-700"
        style={mono ? { fontFamily: "monospace", fontSize: 11 } : undefined}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View>
      <Text className="text-xs text-gray-500 mb-1.5">{label}</Text>
      <View className="flex-row bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onChange(opt.value)}
              className={`flex-1 py-2.5 items-center ${active ? "bg-teal-100" : ""}`}
            >
              <Text
                className={`text-sm font-semibold ${
                  active ? "text-teal-600" : "text-gray-400"
                }`}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
