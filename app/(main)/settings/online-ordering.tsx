/**
 * Settings → Online Ordering (POS).
 *
 * Real operational controls for this location's online store — reads and
 * writes `online_store_config` directly (same table the website dashboard
 * manages; RLS: online_store_config_merchant_write). Server-side enforcement
 * is authoritative, so a saved change takes effect on the guest's next
 * request.
 *
 * Scope: day-to-day operations only (status, channels, order handling,
 * QR kill switch). Identity, branding, hours, SEO, payments, and tipping stay
 * on the merchant dashboard / HQ.
 */

import ManagerPinPrompt from "@/components/qr/ManagerPinPrompt";
import { Switch } from "@/components/ui/switch";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import {
  OnlineStoreConfigService,
  PosOnlineStoreSettings,
  PosOnlineStoreSettingsPatch,
} from "@/services/onlineStoreConfigService";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { buildStoreUrl } from "@/utils/qrTableUrl";
import {
  AlertTriangle,
  Bike,
  CheckCircle2,
  CloudOff,
  Globe,
  Minus,
  PauseCircle,
  Plus,
  QrCode,
  RefreshCcw,
  ShoppingBag,
  Timer,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Scale = (n: number) => number;

const Section: React.FC<{
  title: string;
  sub?: string;
  s: Scale;
  children: React.ReactNode;
}> = ({ title, sub, s, children }) => (
  <View
    style={{
      backgroundColor: colors.panel,
      borderRadius: s(14),
      borderWidth: 1,
      borderColor: colors.border,
      padding: s(14),
    }}
  >
    <Text style={{ fontSize: s(13), fontWeight: "700", color: colors.heading }}>
      {title}
    </Text>
    {sub ? (
      <Text style={{ fontSize: s(11), color: colors.muted, marginTop: s(2) }}>
        {sub}
      </Text>
    ) : null}
    <View style={{ marginTop: s(12), gap: s(10) }}>{children}</View>
  </View>
);

const ToggleRow: React.FC<{
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  sub?: string;
  value: boolean;
  saving: boolean;
  anySaving: boolean;
  onChange: (v: boolean) => void;
  s: Scale;
}> = ({ icon, iconBg, label, sub, value, saving, anySaving, onChange, s }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      gap: s(12),
      paddingVertical: s(10),
      paddingHorizontal: s(12),
      borderRadius: s(12),
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    }}
  >
    <View
      style={{
        width: s(36),
        height: s(36),
        borderRadius: s(11),
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: iconBg,
      }}
    >
      {icon}
    </View>
    <View style={{ flex: 1 }}>
      <Text
        style={{ fontSize: s(13), fontWeight: "700", color: colors.heading }}
      >
        {label}
      </Text>
      {sub ? (
        <Text style={{ fontSize: s(11), color: colors.muted, marginTop: s(1) }}>
          {sub}
        </Text>
      ) : null}
    </View>
    {saving ? (
      <ActivityIndicator size="small" color={colors.teal} />
    ) : (
      <Switch checked={value} onCheckedChange={onChange} disabled={anySaving} />
    )}
  </View>
);

const Stepper: React.FC<{
  icon: React.ReactNode;
  label: string;
  sub?: string;
  value: number;
  suffix: string;
  step: number;
  min: number;
  saving: boolean;
  anySaving: boolean;
  onCommit: (v: number) => void;
  formatValue?: (v: number) => string;
  s: Scale;
}> = ({
  icon,
  label,
  sub,
  value,
  suffix,
  step,
  min,
  saving,
  anySaving,
  onCommit,
  formatValue,
  s,
}) => {
  // Local draft so rapid +/- taps batch into one save on settle. While a
  // settle timer is pending (user still tapping), ignore server echoes so the
  // draft isn't clobbered mid-adjustment.
  const [draft, setDraft] = useState(value);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adjustingRef = useRef(false);
  useEffect(() => {
    if (!adjustingRef.current) setDraft(value);
  }, [value]);

  const bump = (delta: number) => {
    const next = Math.max(min, draft + delta);
    setDraft(next);
    adjustingRef.current = true;
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      adjustingRef.current = false;
      onCommit(next);
    }, 1000);
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(12),
        paddingVertical: s(10),
        paddingHorizontal: s(12),
        borderRadius: s(12),
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <View
        style={{
          width: s(36),
          height: s(36),
          borderRadius: s(11),
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.teal + "1A",
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: s(13), fontWeight: "700", color: colors.heading }}
        >
          {label}
        </Text>
        {sub ? (
          <Text
            style={{ fontSize: s(11), color: colors.muted, marginTop: s(1) }}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
        <TouchableOpacity
          onPress={() => bump(-step)}
          disabled={draft <= min}
          style={{
            width: s(30),
            height: s(30),
            borderRadius: s(9),
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: draft <= min ? 0.4 : 1,
          }}
        >
          <Minus size={s(14)} color={colors.heading} />
        </TouchableOpacity>
        <View
          style={{
            minWidth: s(64),
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: s(5),
          }}
        >
          <Text
            style={{
              fontSize: s(14),
              fontWeight: "800",
              color: colors.heading,
            }}
          >
            {formatValue ? formatValue(draft) : draft}
            {suffix ? ` ${suffix}` : ""}
          </Text>
          {saving ? (
            <ActivityIndicator size="small" color={colors.teal} />
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => bump(step)}
          style={{
            width: s(30),
            height: s(30),
            borderRadius: s(9),
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Plus size={s(14)} color={colors.heading} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const OnlineOrderingSettings: React.FC = () => {
  const insets = useSafeAreaInsets();
  const uiScale = useUiScale();
  const s: Scale = (n) => Math.round(n * uiScale);
  const client = useSupabaseClient();
  const locationId = useStoreSettingsStore(
    (st) => st.selectedStore?.id ?? null,
  );
  const showToast = useToastStore((st) => st.show);

  const [settings, setSettings] = useState<PosOnlineStoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [killSwitchPinOpen, setKillSwitchPinOpen] = useState(false);

  const load = useCallback(async () => {
    if (!locationId || !client) return;
    setLoading(true);
    setLoadError(null);
    const { data, error } = await OnlineStoreConfigService.get(
      client,
      locationId,
    );
    if (error) setLoadError(error.message ?? "Failed to load settings");
    else setSettings(data);
    setLoading(false);
  }, [client, locationId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Optimistic patch with rollback on failure. */
  const patch = useCallback(
    async (key: string, changes: PosOnlineStoreSettingsPatch) => {
      if (!settings || !client) return;
      const prev = settings;
      setSettings({ ...settings, ...changes });
      setSavingKey(key);
      const { data, error } = await OnlineStoreConfigService.update(
        client,
        settings.id,
        changes,
      );
      setSavingKey(null);
      if (error || !data) {
        setSettings(prev);
        showToast({
          title: "Save failed",
          message: error?.message ?? "Could not update the online store",
          type: "error",
        });
        return;
      }
      setSettings(data);
    },
    [client, settings, showToast],
  );

  const storeUrl = settings
    ? buildStoreUrl({
        slug: settings.slug,
        customDomain: settings.customDomain,
      })
    : "";

  const anySaving = savingKey !== null;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.screen,
        paddingHorizontal: s(14),
        paddingVertical: s(10),
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: s(10),
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: s(15),
              fontWeight: "700",
              color: colors.heading,
            }}
          >
            Online Ordering
          </Text>
          <Text
            style={{ fontSize: s(11), color: colors.label, marginTop: s(1) }}
          >
            Live storefront controls for this location.
          </Text>
        </View>
        <TouchableOpacity
          onPress={load}
          disabled={loading}
          style={{
            padding: s(9),
            borderRadius: s(10),
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.panel,
          }}
        >
          <RefreshCcw size={s(14)} color={colors.label} />
        </TouchableOpacity>
      </View>

      <View
        style={{
          height: 1,
          backgroundColor: colors.border,
          marginBottom: s(10),
        }}
      />

      {loading ? (
        <ActivityIndicator color={colors.teal} style={{ marginTop: s(60) }} />
      ) : loadError ? (
        <View style={{ alignItems: "center", marginTop: s(60), gap: s(10) }}>
          <AlertTriangle size={s(28)} color={colors.warning} />
          <Text style={{ color: colors.label, fontSize: s(13) }}>
            {loadError}
          </Text>
          <TouchableOpacity
            onPress={load}
            style={{
              paddingHorizontal: s(16),
              paddingVertical: s(10),
              borderRadius: s(10),
              backgroundColor: colors.teal,
            }}
          >
            <Text style={{ color: colors.onSolid, fontWeight: "700" }}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : !settings ? (
        <View
          style={{
            alignItems: "center",
            marginTop: s(60),
            gap: s(10),
            paddingHorizontal: s(30),
          }}
        >
          <CloudOff size={s(30)} color={colors.muted} />
          <Text
            style={{
              color: colors.heading,
              fontSize: s(14),
              fontWeight: "700",
            }}
          >
            No online store yet
          </Text>
          <Text
            style={{
              color: colors.muted,
              fontSize: s(12),
              textAlign: "center",
            }}
          >
            Online-store setup for this location has not been completed. Request
            setup from the merchant dashboard.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + s(80) }}
        >
          <View style={{ gap: s(10) }}>
            {/* 1. Store status */}
            <Section
              title="Store Status"
              sub={storeUrl ? storeUrl.replace(/^https?:\/\//, "") : undefined}
              s={s}
            >
              <TouchableOpacity
                onPress={() =>
                  patch("isActive", { isActive: !settings.isActive })
                }
                disabled={anySaving}
                style={{
                  height: s(52),
                  borderRadius: s(12),
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: s(10),
                  backgroundColor: settings.isActive
                    ? colors.success + "18"
                    : colors.danger + "14",
                  borderWidth: 1,
                  borderColor: settings.isActive
                    ? colors.success + "45"
                    : colors.danger + "40",
                }}
              >
                {savingKey === "isActive" ? (
                  <ActivityIndicator
                    color={settings.isActive ? colors.success : colors.danger}
                  />
                ) : settings.isActive ? (
                  <>
                    <CheckCircle2 size={s(18)} color={colors.success} />
                    <Text
                      style={{
                        color: colors.success,
                        fontWeight: "800",
                        fontSize: s(14),
                      }}
                    >
                      Store is ONLINE — tap to take offline
                    </Text>
                  </>
                ) : (
                  <>
                    <PauseCircle size={s(18)} color={colors.danger} />
                    <Text
                      style={{
                        color: colors.danger,
                        fontWeight: "800",
                        fontSize: s(14),
                      }}
                    >
                      Store is OFFLINE — tap to go online
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </Section>

            {/* 2. Order channels */}
            <Section
              title="Order Channels"
              sub="Which ways guests can order from the storefront."
              s={s}
            >
              <ToggleRow
                icon={<ShoppingBag size={s(16)} color={colors.teal} />}
                iconBg={colors.teal + "1A"}
                label="Pickup"
                sub="Guests order ahead and collect in store"
                value={settings.acceptsPickup}
                saving={savingKey === "acceptsPickup"}
                anySaving={anySaving}
                onChange={(v) => patch("acceptsPickup", { acceptsPickup: v })}
                s={s}
              />
              <ToggleRow
                icon={<Bike size={s(16)} color={colors.teal} />}
                iconBg={colors.teal + "1A"}
                label="Delivery"
                sub="Orders delivered to the guest"
                value={settings.acceptsDelivery}
                saving={savingKey === "acceptsDelivery"}
                anySaving={anySaving}
                onChange={(v) =>
                  patch("acceptsDelivery", { acceptsDelivery: v })
                }
                s={s}
              />
              <ToggleRow
                icon={<QrCode size={s(16)} color={colors.teal} />}
                iconBg={colors.teal + "1A"}
                label="QR Dine-In"
                sub="At-table ordering via printed QR tents"
                value={settings.acceptsDineIn}
                saving={savingKey === "acceptsDineIn"}
                anySaving={anySaving}
                onChange={(v) => patch("acceptsDineIn", { acceptsDineIn: v })}
                s={s}
              />
            </Section>

            {/* 3. Order handling */}
            <Section
              title="Order Handling"
              sub="How incoming online orders are processed."
              s={s}
            >
              <ToggleRow
                icon={<Zap size={s(16)} color={colors.warning} />}
                iconBg={colors.warning + "1A"}
                label="Auto-accept orders"
                sub="Off = new orders wait for Accept/Decline on the POS"
                value={settings.autoAcceptOrders}
                saving={savingKey === "autoAcceptOrders"}
                anySaving={anySaving}
                onChange={(v) =>
                  patch("autoAcceptOrders", { autoAcceptOrders: v })
                }
                s={s}
              />
              <Stepper
                icon={<Timer size={s(16)} color={colors.teal} />}
                label="Prep lead time"
                sub="Quoted to guests as the estimated wait"
                value={settings.estimatedPrepMinutes}
                suffix="min"
                step={5}
                min={0}
                saving={savingKey === "estimatedPrepMinutes"}
                anySaving={anySaving}
                onCommit={(v) =>
                  patch("estimatedPrepMinutes", { estimatedPrepMinutes: v })
                }
                s={s}
              />
              <Stepper
                icon={<Globe size={s(16)} color={colors.teal} />}
                label="Minimum order"
                sub="Carts below this cannot check out"
                value={settings.minOrder}
                suffix=""
                step={1}
                min={0}
                saving={savingKey === "minOrder"}
                anySaving={anySaving}
                onCommit={(v) => patch("minOrder", { minOrder: v })}
                formatValue={(v) => `$${v.toFixed(0)}`}
                s={s}
              />
            </Section>

            {/* 4. Emergency */}
            <Section
              title="Emergency"
              sub="Manager only. Use when QR ordering must stop immediately."
              s={s}
            >
              <ToggleRow
                icon={<AlertTriangle size={s(16)} color={colors.danger} />}
                iconBg={colors.danger + "14"}
                label="QR kill switch"
                sub={
                  settings.qrKillSwitch
                    ? "ACTIVE — all QR tents are rejected right now"
                    : "All printed tents stop working while active"
                }
                value={settings.qrKillSwitch}
                saving={savingKey === "qrKillSwitch"}
                anySaving={anySaving}
                onChange={() => setKillSwitchPinOpen(true)}
                s={s}
              />
            </Section>
          </View>
        </ScrollView>
      )}

      <ManagerPinPrompt
        visible={killSwitchPinOpen}
        subtitle={
          settings?.qrKillSwitch
            ? "Deactivate the QR kill switch"
            : "Activate the QR kill switch — all printed tents stop working"
        }
        onApproved={() => {
          setKillSwitchPinOpen(false);
          if (settings) {
            patch("qrKillSwitch", { qrKillSwitch: !settings.qrKillSwitch });
          }
        }}
        onCancel={() => setKillSwitchPinOpen(false)}
      />
    </View>
  );
};

export default OnlineOrderingSettings;
