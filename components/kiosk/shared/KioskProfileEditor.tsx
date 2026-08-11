import { KioskAssetsManager } from "@/components/kiosk/shared/KioskAssetsManager";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { toastService } from "@/lib/toastService";
import type {
  KioskConfig,
  KioskOrientation,
  KioskTemplateId,
} from "@/types/kiosk";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Images,
  Info,
  LayoutGrid,
  Minus,
  Palette,
  Pipette,
  Plus,
  Power,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import ColorPicker, { BrightnessSlider, Panel3 } from "reanimated-color-picker";

/**
 * On-device editor for the kiosk profile (kiosk_profiles row) — the same
 * options the web dashboard configures, editable on the tablet behind the
 * manager PIN. Media (logo / images / video) stays web-only (no on-device
 * upload) and is shown read-only.
 *
 *   Sync  → pull the latest profile from the backend (refetch + re-normalize).
 *   Save  → write the edited fields back to kiosk_profiles.
 *
 * Options are grouped into collapsible sections so the screen is easy to scan;
 * the Sync/Save bar stays at the top of the card. Edits live in a local `draft`;
 * a background poll only refreshes the form when there are no unsaved changes,
 * so it never clobbers what the manager is typing.
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

const TEAL = "#0D9488";

/** Common tip percentages offered as one-tap chips (merged with any existing
 *  custom presets so nothing a merchant already saved is lost). */
const COMMON_TIPS = [10, 12, 15, 18, 20, 22, 25, 30];

/** Font families offered in the dropdown. The current value is always included
 *  even if it isn't in this list, so a web-set font is never dropped. */
const FONT_OPTIONS = [
  "Inter",
  "Roboto",
  "Poppins",
  "Montserrat",
  "Lato",
  "Open Sans",
  "Nunito",
  "Playfair Display",
];

/** Template preview cards — mirrors the website's Template picker copy. */
const TEMPLATES: { value: KioskTemplateId; name: string; desc: string }[] = [
  {
    value: "template_a",
    name: "Template A",
    desc: "Menu-first grid with a large hero header.",
  },
  {
    value: "template_b",
    name: "Template B",
    desc: "Category rail with compact product rows.",
  },
  {
    value: "template_c",
    name: "Template C",
    desc: "Visual browse layout for high-traffic counters.",
  },
];

const uniqSorted = (nums: number[]): number[] =>
  Array.from(new Set(nums)).sort((a, b) => a - b);

/** Seconds → friendly "45s" / "1m 30s" for the timeout steppers. */
function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

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
  // Tip presets edited as one-tap chips (no comma-typing).
  const [tipPresets, setTipPresets] = useState<number[]>(() => [
    ...config.tipPresets,
  ]);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const baseline = useMemo(() => extractEditable(config), [config]);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(baseline) ||
    JSON.stringify(uniqSorted(tipPresets)) !==
      JSON.stringify(uniqSorted(config.tipPresets));

  // Refresh the form from a background poll ONLY when there are no unsaved
  // edits — otherwise keep what the manager is typing.
  useEffect(() => {
    if (!dirty) {
      setDraft(extractEditable(config));
      setTipPresets([...config.tipPresets]);
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
        tip_presets: uniqSorted(tipPresets),
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
        message:
          err instanceof Error ? err.message : "Could not save settings.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <View className="flex-row items-center gap-2">
        <Settings2 size={16} color="#6B7280" />
        <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Kiosk Profile
        </Text>
      </View>

      {/* Sticky-ish action bar — Sync (pull) + Save (push). */}
      <View className="rounded-2xl border border-gray-200 bg-white p-3">
        <View className="flex-row items-center justify-between mb-2.5">
          <Text
            className="text-base font-bold text-black flex-1"
            numberOfLines={1}
          >
            {draft.profileName || "Kiosk"}
          </Text>
          {dirty ? (
            <View className="px-2 py-0.5 rounded-full bg-amber-100">
              <Text className="text-[11px] font-bold text-amber-700">
                Unsaved
              </Text>
            </View>
          ) : (
            <View className="px-2 py-0.5 rounded-full bg-green-100">
              <Text className="text-[11px] font-bold text-green-700">Saved</Text>
            </View>
          )}
        </View>
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={handleSync}
            disabled={syncing}
            className="flex-1 py-3 rounded-xl items-center flex-row justify-center border border-gray-200 bg-gray-50"
          >
            {syncing ? (
              <ActivityIndicator size="small" color={TEAL} />
            ) : (
              <RefreshCw size={15} color={TEAL} />
            )}
            <Text className="text-sm font-bold text-teal-600 ml-1.5">
              Sync
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!dirty || saving}
            className={`flex-[1.4] py-3 rounded-xl items-center flex-row justify-center ${
              dirty && !saving ? "bg-teal-600" : "bg-gray-200"
            }`}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Check size={16} color="#FFFFFF" />
            )}
            <Text className="text-sm font-bold text-white ml-1.5">
              Save changes
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Collapsible option groups. */}
      <Collapsible title="General" Icon={Info} defaultOpen>
        <TextField
          label="Profile name"
          value={draft.profileName}
          onChangeText={(v) => set("profileName", v)}
        />
        <TemplatePicker
          value={draft.templateId}
          onChange={(v) => set("templateId", v)}
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
        <View>
          <TextField
            label="Pickup number prefix"
            hint="Shown in front of the customer's pickup number on the order-ready screen."
            value={draft.pickupNumberPrefix}
            onChangeText={(v) => set("pickupNumberPrefix", v)}
            placeholder="e.g. A-"
            maxLength={6}
          />
          <View className="flex-row items-center mt-2">
            <Text className="text-[11px] text-gray-400 mr-2">Preview</Text>
            <View className="px-2.5 py-1 rounded-lg bg-gray-100">
              <Text className="text-sm font-bold text-gray-700">
                {(draft.pickupNumberPrefix || "") + "045"}
              </Text>
            </View>
          </View>
        </View>
      </Collapsible>

      <Collapsible title="Appearance" Icon={Palette}>
        <View className="flex-row flex-wrap" style={{ rowGap: 12 }}>
          <ColorField label="Primary" value={draft.primaryColor} onChangeText={(v) => set("primaryColor", v)} />
          <ColorField label="Background" value={draft.backgroundColor} onChangeText={(v) => set("backgroundColor", v)} />
          <ColorField label="Text" value={draft.textColor} onChangeText={(v) => set("textColor", v)} />
          <ColorField label="Header text" value={draft.headerTextColor} onChangeText={(v) => set("headerTextColor", v)} />
          <ColorField label="Secondary" value={draft.secondaryColor} onChangeText={(v) => set("secondaryColor", v)} />
          <ColorField label="Accent" value={draft.accentColor} onChangeText={(v) => set("accentColor", v)} />
        </View>
        <SelectField
          label="Font family"
          value={draft.fontFamily}
          options={FONT_OPTIONS}
          onChange={(v) => set("fontFamily", v)}
        />
      </Collapsible>

      <Collapsible title="Media & Assets" Icon={Images}>
        <KioskAssetsManager
          config={config}
          onRefreshKioskConfig={onRefreshKioskConfig}
        />
      </Collapsible>

      <Collapsible title="Timing" Icon={Clock}>
        <Stepper
          label="Idle timeout"
          hint="How long the kiosk waits, with no touches, before returning to the welcome screen."
          value={draft.idleTimeoutSeconds}
          onChange={(n) => set("idleTimeoutSeconds", n)}
          step={15}
          min={15}
          max={600}
        />
        <Stepper
          label="Cart reset timeout"
          hint="How long an abandoned cart is kept before it's cleared."
          value={draft.cartResetTimeoutSeconds}
          onChange={(n) => set("cartResetTimeoutSeconds", n)}
          step={5}
          min={5}
          max={300}
        />
      </Collapsible>

      <Collapsible title="Checkout & Tips" Icon={CreditCard}>
        <ToggleRow label="Tip screen" value={draft.tipScreenEnabled} onChange={(v) => set("tipScreenEnabled", v)} />
        <TipPresetsEditor value={tipPresets} onChange={setTipPresets} />
        <ToggleRow label="Auto-print receipt" value={draft.autoPrintReceipt} onChange={(v) => set("autoPrintReceipt", v)} />
        <ToggleRow label="Email receipt prompt" value={draft.receiptEmailPrompt} onChange={(v) => set("receiptEmailPrompt", v)} />
        <ToggleRow label="SMS receipt prompt" value={draft.receiptSmsPrompt} onChange={(v) => set("receiptSmsPrompt", v)} />
        <ToggleRow label="Loyalty enrollment" value={draft.loyaltyEnrollmentEnabled} onChange={(v) => set("loyaltyEnrollmentEnabled", v)} />
      </Collapsible>

      <Collapsible title="Menu Display" Icon={LayoutGrid}>
        <ToggleRow label="Show calories" value={draft.showCalorieInfo} onChange={(v) => set("showCalorieInfo", v)} />
        <ToggleRow label="Show allergens" value={draft.showAllergens} onChange={(v) => set("showAllergens", v)} />
      </Collapsible>

      <Collapsible title="Status & Info" Icon={Power}>
        <ToggleRow label="Profile active" value={draft.isActive} onChange={(v) => set("isActive", v)} />
        <ReadOnlyRow label="Profile ID" value={config.id} mono />
        <ReadOnlyRow label="Published" value={config.publishedAt ?? "Never"} />
        <ReadOnlyRow
          label="Media"
          value={`Logo ${config.logoUrl ? "set" : "none"} · edit on web`}
        />
      </Collapsible>
    </View>
  );
}

// ── Collapsible section ──

function Collapsible({
  title,
  Icon,
  defaultOpen,
  children,
}: {
  title: string;
  Icon: typeof Info;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <View className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
      <TouchableOpacity
        onPress={() => setOpen((o) => !o)}
        className="flex-row items-center px-4 py-3.5"
        activeOpacity={0.7}
      >
        <View className="w-8 h-8 rounded-lg bg-gray-100 items-center justify-center mr-3">
          <Icon size={16} color="#6B7280" />
        </View>
        <Text className="flex-1 text-base font-semibold text-black">
          {title}
        </Text>
        {open ? (
          <ChevronDown size={20} color="#9CA3AF" />
        ) : (
          <ChevronRight size={20} color="#9CA3AF" />
        )}
      </TouchableOpacity>
      {open ? (
        <View className="px-4 pb-4 pt-1" style={{ gap: 14 }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

// ── Field primitives ──

function TextField({
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  maxLength,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numbers-and-punctuation";
  maxLength?: number;
}) {
  return (
    <View>
      <Text className="text-xs font-medium text-gray-500 mb-1.5">{label}</Text>
      {hint ? (
        <Text className="text-[11px] text-gray-400 mb-1.5 -mt-1">{hint}</Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
        maxLength={maxLength}
        className="bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3 text-base text-black"
      />
    </View>
  );
}

/** −/+ stepper for numeric settings (timeouts) — no keyboard needed. */
function Stepper({
  label,
  hint,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const atMin = value <= min;
  const atMax = value >= max;
  return (
    <View>
      <Text className="text-xs font-medium text-gray-500 mb-1.5">{label}</Text>
      {hint ? (
        <Text className="text-[11px] text-gray-400 mb-1.5 -mt-1">{hint}</Text>
      ) : null}
      <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl p-1.5">
        <TouchableOpacity
          onPress={() => onChange(clamp(value - step))}
          disabled={atMin}
          activeOpacity={0.7}
          className={`w-14 h-12 rounded-lg items-center justify-center ${
            atMin ? "bg-gray-100" : "bg-white border border-gray-200"
          }`}
        >
          <Minus size={22} color={atMin ? "#D1D5DB" : "#111827"} />
        </TouchableOpacity>
        <View className="flex-1 items-center">
          <Text className="text-xl font-bold text-black">
            {formatDuration(value)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => onChange(clamp(value + step))}
          disabled={atMax}
          activeOpacity={0.7}
          className={`w-14 h-12 rounded-lg items-center justify-center ${
            atMax ? "bg-gray-100" : "bg-white border border-gray-200"
          }`}
        >
          <Plus size={22} color={atMax ? "#D1D5DB" : "#111827"} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Tap-to-pick dropdown (font family). Opens a simple option list in a modal. */
function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Always include the current value so a web-set option is never lost.
  const opts =
    !value || options.includes(value) ? options : [value, ...options];
  return (
    <View>
      <Text className="text-xs font-medium text-gray-500 mb-1.5">{label}</Text>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3"
      >
        <Text className="flex-1 text-base text-black">
          {value || "System default"}
        </Text>
        <ChevronDown size={18} color="#9CA3AF" />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <Pressable
          onPress={() => setOpen(false)}
          className="flex-1 bg-black/50 items-center justify-center px-6"
        >
          <Pressable
            onPress={() => {}}
            className="w-full bg-white rounded-3xl overflow-hidden"
            style={[{ maxWidth: 360 }, modalShadow]}
          >
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-gray-100">
              <Text className="text-base font-bold text-black">{label}</Text>
              <Pressable
                onPress={() => setOpen(false)}
                className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center"
              >
                <X size={18} color="#6B7280" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {opts.map((opt) => {
                const active = opt === value;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => {
                      onChange(opt);
                      setOpen(false);
                    }}
                    activeOpacity={0.7}
                    className={`flex-row items-center px-5 py-4 border-b border-gray-50 ${
                      active ? "bg-teal-50" : ""
                    }`}
                  >
                    <Text
                      className={`flex-1 text-base ${
                        active ? "font-bold text-teal-700" : "text-gray-800"
                      }`}
                    >
                      {opt}
                    </Text>
                    {active ? <Check size={18} color={TEAL} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Tip presets as one-tap percentage chips — no comma-separated typing. */
function TipPresetsEditor({
  value,
  onChange,
}: {
  value: number[];
  onChange: (next: number[]) => void;
}) {
  const selected = new Set(value);
  const chips = uniqSorted([...COMMON_TIPS, ...value]);
  const toggle = (n: number) => {
    const next = new Set(value);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    onChange(uniqSorted([...next]));
  };
  return (
    <View>
      <Text className="text-xs font-medium text-gray-500 mb-1">
        Tip presets
      </Text>
      <Text className="text-[11px] text-gray-400 mb-2.5">
        Tap the tip amounts to show on the kiosk tip screen.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {chips.map((n) => {
          const on = selected.has(n);
          return (
            <TouchableOpacity
              key={n}
              onPress={() => toggle(n)}
              activeOpacity={0.8}
              className={`px-4 py-2.5 rounded-full border ${
                on
                  ? "bg-teal-600 border-teal-600"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <Text
                className={`text-sm font-bold ${
                  on ? "text-white" : "text-gray-500"
                }`}
              >
                {n}%
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {value.length === 0 ? (
        <Text className="text-[11px] text-amber-600 mt-2">
          No tips selected — the kiosk tip screen will show no preset buttons.
        </Text>
      ) : null}
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const valid = /^#([0-9a-fA-F]{3,8})$/.test(value.trim());
  return (
    <View style={{ width: "50%", paddingRight: 8 }}>
      <Text className="text-xs font-medium text-gray-500 mb-1.5">{label}</Text>
      <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-2">
        {/* Tap the swatch (or the pipette) to open the color wheel. */}
        <Pressable onPress={() => setPickerOpen(true)} hitSlop={8}>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              marginRight: 8,
              backgroundColor: valid ? value.trim() : "#FFFFFF",
              borderWidth: 1,
              borderColor: "#E0E0E0",
            }}
          />
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="#000000"
          placeholderTextColor="#9CA3AF"
          className="flex-1 text-sm text-black"
          style={{ fontFamily: "monospace", padding: 0 }}
        />
        <Pressable
          onPress={() => setPickerOpen(true)}
          hitSlop={8}
          className="w-7 h-7 rounded-lg bg-white border border-gray-200 items-center justify-center ml-1"
        >
          <Pipette size={14} color={TEAL} />
        </Pressable>
      </View>

      <ColorWheelModal
        visible={pickerOpen}
        label={label}
        color={valid ? value.trim() : "#000000"}
        onClose={() => setPickerOpen(false)}
        onSelect={(hex) => {
          onChangeText(hex);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

const modalShadow = {
  shadowColor: "#0F172A",
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.18,
  shadowRadius: 24,
  elevation: 12,
} as const;

/**
 * Full color-wheel picker (hue + saturation wheel with a brightness slider),
 * shown in a modal when a color swatch is tapped. Commits on "Use color" so a
 * mid-drag value never lands in the profile draft. The wheel + slider come from
 * reanimated-color-picker (pure JS on top of the reanimated + gesture-handler
 * already bundled) so there's no native rebuild. Gestures inside a RN Modal
 * need their own GestureHandlerRootView.
 */
function ColorWheelModal({
  visible,
  label,
  color,
  onClose,
  onSelect,
}: {
  visible: boolean;
  label: string;
  color: string;
  onClose: () => void;
  onSelect: (hex: string) => void;
}) {
  const [local, setLocal] = useState(color);

  // Reset the working color each time the sheet opens.
  useEffect(() => {
    if (visible) setLocal(color);
  }, [visible, color]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable
          onPress={onClose}
          className="flex-1 bg-black/50 items-center justify-center px-6"
        >
          {/* Inner Pressable swallows taps so the card doesn't dismiss. */}
          <Pressable
            onPress={() => {}}
            className="w-full bg-white rounded-3xl p-6"
            style={[{ maxWidth: 380 }, modalShadow]}
          >
            <View className="flex-row items-center justify-between mb-5">
              <Text className="text-lg font-bold text-black capitalize">
                {label} color
              </Text>
              <Pressable
                onPress={onClose}
                className="w-9 h-9 rounded-full bg-gray-100 items-center justify-center"
              >
                <X size={18} color="#6B7280" />
              </Pressable>
            </View>

            {visible ? (
              <ColorPicker
                value={color}
                onCompleteJS={(c) => setLocal(c.hex)}
                style={{ gap: 24 }}
              >
                <Panel3
                  style={{ width: 240, height: 240, alignSelf: "center" }}
                  thumbSize={28}
                />
                <BrightnessSlider
                  style={{ borderRadius: 999 }}
                  sliderThickness={26}
                  thumbSize={28}
                />
              </ColorPicker>
            ) : null}

            {/* Preview + resolved hex */}
            <View className="flex-row items-center gap-3 mt-6">
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  backgroundColor: local,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                }}
              />
              <View className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-3">
                <Text
                  className="text-base text-black"
                  style={{ fontFamily: "monospace" }}
                >
                  {local.toUpperCase()}
                </Text>
              </View>
            </View>

            <View className="flex-row gap-3 mt-5">
              <Pressable
                onPress={onClose}
                className="flex-1 py-3.5 rounded-2xl bg-gray-100 items-center"
              >
                <Text className="text-base font-bold text-gray-700">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onSelect(local)}
                className="flex-1 py-3.5 rounded-2xl bg-teal-600 items-center"
              >
                <Text className="text-base font-bold text-white">
                  Use color
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
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
      <Text className="text-base text-gray-700">{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: TEAL, false: "#E0E0E0" }}
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
        className="text-sm font-medium text-gray-700 flex-1 text-right"
        style={mono ? { fontFamily: "monospace", fontSize: 11 } : undefined}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** Template chooser with a mini wireframe preview per layout (A / B / C),
 *  mirroring the website's Template picker. */
function TemplatePicker({
  value,
  onChange,
}: {
  value: KioskTemplateId;
  onChange: (v: KioskTemplateId) => void;
}) {
  return (
    <View>
      <Text className="text-xs font-medium text-gray-500 mb-1">Template</Text>
      <Text className="text-[11px] text-gray-400 mb-2.5">
        Layout the kiosk uses for browsing and ordering.
      </Text>
      <View className="flex-row gap-2.5">
        {TEMPLATES.map((t) => {
          const active = value === t.value;
          return (
            <TouchableOpacity
              key={t.value}
              onPress={() => onChange(t.value)}
              activeOpacity={0.85}
              className={`flex-1 rounded-2xl border p-2.5 ${
                active
                  ? "border-teal-500 bg-teal-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <TemplateThumb kind={t.value} />
              <View className="flex-row items-center justify-between mt-2">
                <Text className="text-sm font-bold text-black" numberOfLines={1}>
                  {t.name}
                </Text>
                {active ? (
                  <View className="w-5 h-5 rounded-full bg-teal-600 items-center justify-center">
                    <Check size={13} color="#FFFFFF" />
                  </View>
                ) : null}
              </View>
              <Text
                className="text-[11px] text-gray-400 mt-0.5"
                numberOfLines={2}
              >
                {t.desc}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/** Small wireframe thumbnail conveying each template's layout. */
function TemplateThumb({ kind }: { kind: KioskTemplateId }) {
  return (
    <View
      className="rounded-xl bg-gray-100 p-2"
      style={{ height: 86, overflow: "hidden" }}
    >
      {kind === "template_a" ? (
        // Large hero header over a grid of tiles.
        <View style={{ flex: 1, gap: 6 }}>
          <View className="rounded-md bg-teal-400" style={{ height: 24 }} />
          <View className="flex-row" style={{ flex: 1, gap: 6 }}>
            <View className="flex-1 rounded-md bg-gray-300" />
            <View className="flex-1 rounded-md bg-gray-300" />
            <View className="flex-1 rounded-md bg-gray-300" />
          </View>
        </View>
      ) : kind === "template_b" ? (
        // Left category rail + compact stacked rows.
        <View className="flex-row" style={{ flex: 1, gap: 6 }}>
          <View className="rounded-md bg-teal-400" style={{ width: 22 }} />
          <View style={{ flex: 1, gap: 5 }}>
            <View className="rounded-md bg-gray-300" style={{ height: 12 }} />
            <View className="rounded-md bg-gray-300" style={{ height: 12 }} />
            <View className="rounded-md bg-gray-300" style={{ height: 12 }} />
          </View>
        </View>
      ) : (
        // Visual 2×2 image-forward grid.
        <View style={{ flex: 1, gap: 6 }}>
          <View className="flex-row" style={{ flex: 1, gap: 6 }}>
            <View className="flex-1 rounded-md bg-teal-400" />
            <View className="flex-1 rounded-md bg-gray-300" />
          </View>
          <View className="flex-row" style={{ flex: 1, gap: 6 }}>
            <View className="flex-1 rounded-md bg-gray-300" />
            <View className="flex-1 rounded-md bg-gray-300" />
          </View>
        </View>
      )}
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
      <Text className="text-xs font-medium text-gray-500 mb-1.5">{label}</Text>
      <View className="flex-row bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onChange(opt.value)}
              className={`flex-1 py-3 items-center ${active ? "bg-teal-600" : ""}`}
            >
              <Text
                className={`text-sm font-semibold ${
                  active ? "text-white" : "text-gray-400"
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
