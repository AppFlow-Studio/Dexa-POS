/**
 * TableQrSheet — POS-side QR table ordering management for a single table.
 *
 * Opened from TableContextSheet's "QR Code" action. Provides:
 *  - Print / Reprint (same token when an active code exists)
 *  - Regenerate (manager PIN gated; rotates token, old tent stops working)
 *  - QR On/Off for this table (manager PIN gated; Off = revoke, On = new code)
 *  - Preview (on-screen QR of the exact guest URL)
 *
 * Backend contract: generate_table_qr_code RPC + table_qr_codes reads.
 * Never touches table sessions — QR is "an order with a label".
 */

import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import {
  ActiveTableQrCode,
  FloorPlanService,
  QrStoreConfig,
} from "@/services/floorPlanService";
import { PrinterService } from "@/services/printing/PrinterService";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useToastStore } from "@/stores/useToastStore";
import { buildQrTableUrl } from "@/utils/qrTableUrl";
import {
  Ban,
  CheckCircle2,
  Eye,
  Printer,
  QrCode,
  RefreshCcw,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import ManagerPinPrompt from "./ManagerPinPrompt";

export const QR_BRAND_BLUE = "#0C4FD1";

interface TableQrSheetProps {
  visible: boolean;
  floorPlanObjectId: string;
  tableLabel: string;
  onClose: () => void;
}

type ConfirmKind = "regenerate" | "turn_off" | "turn_on" | null;

const TableQrSheet: React.FC<TableQrSheetProps> = ({
  visible,
  floorPlanObjectId,
  tableLabel,
  onClose,
}) => {
  const client = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const showToast = useToastStore((s) => s.show);
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeCode, setActiveCode] = useState<ActiveTableQrCode | null>(null);
  const [storeConfig, setStoreConfig] = useState<QrStoreConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [pinFor, setPinFor] = useState<ConfirmKind>(null);

  const locationId = selectedStore?.id ?? null;

  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setLoadError(null);
    const [codeRes, cfgRes] = await Promise.all([
      FloorPlanService.getActiveTableQrCode(client, floorPlanObjectId),
      FloorPlanService.getQrStoreConfig(client, locationId),
    ]);
    if (codeRes.error) setLoadError(codeRes.error.message ?? "Failed to load QR state");
    else setActiveCode(codeRes.data);
    if (cfgRes.error) setLoadError(cfgRes.error.message ?? "Failed to load store config");
    else setStoreConfig(cfgRes.data);
    setLoading(false);
  }, [client, floorPlanObjectId, locationId]);

  useEffect(() => {
    if (visible) {
      setPreviewOpen(false);
      setConfirmKind(null);
      setPinFor(null);
      load();
    }
  }, [visible, load]);

  // Store-level gate: the guest scan route rejects unless all of these hold.
  const storeGateReason = !storeConfig
    ? "Online ordering is not configured for this location."
    : !storeConfig.slug && !storeConfig.custom_domain
      ? "The online store has no URL configured."
      : storeConfig.is_active === false
        ? "The online store is inactive."
        : storeConfig.accepts_dine_in === false
          ? "QR dine-in is disabled for this store."
          : storeConfig.qr_kill_switch === true
            ? "QR ordering is currently switched off for this store."
            : null;

  const activeQrUrl =
    activeCode && storeConfig
      ? buildQrTableUrl({
          slug: storeConfig.slug,
          customDomain: storeConfig.custom_domain,
          token: activeCode.token,
        })
      : "";

  const printTent = useCallback(
    async (token: string) => {
      if (!locationId || !storeConfig) return false;
      const qrUrl = buildQrTableUrl({
        slug: storeConfig.slug,
        customDomain: storeConfig.custom_domain,
        token,
      });
      if (!qrUrl) {
        showToast({ title: "QR Error", message: "Could not build the guest URL for this QR code.", type: "error" });
        return false;
      }
      const printed = await PrinterService.printTableQr({
        tableLabel,
        storeName: storeConfig.store_name || selectedStore?.name || "",
        qrData: qrUrl,
        locationId,
      });
      if (printed) {
        showToast({ title: "Printing", message: `QR tent queued to print for ${tableLabel}`, type: "success" });
      } else {
        // The code is already saved server-side — offer the on-screen fallback.
        showToast({ title: "Printer Offline", message: "No receipt printer available — showing on-screen QR instead.", type: "warning" });
        setPreviewOpen(true);
      }
      return printed;
    },
    [locationId, storeConfig, tableLabel, selectedStore?.name, showToast],
  );

  const handlePrintOrReprint = useCallback(async () => {
    setBusy("print");
    try {
      const { data, error } = await FloorPlanService.generateTableQrCode(
        client,
        { floorPlanObjectId, regenerate: false },
      );
      if (error || !data?.token) {
        showToast({ title: "QR Error", message: error?.message ?? "Failed to generate QR code", type: "error" });
        return;
      }
      await load();
      await printTent(data.token);
    } finally {
      setBusy(null);
    }
  }, [client, floorPlanObjectId, load, printTent, showToast]);

  const handleRegenerate = useCallback(async () => {
    setBusy("regenerate");
    try {
      const { data, error } = await FloorPlanService.generateTableQrCode(
        client,
        { floorPlanObjectId, regenerate: true },
      );
      if (error || !data?.token) {
        showToast({ title: "QR Error", message: error?.message ?? "Failed to regenerate QR code", type: "error" });
        return;
      }
      await load();
      showToast({ title: "QR Regenerated", message: `The old printed code for ${tableLabel} no longer works.`, type: "success" });
      await printTent(data.token);
    } finally {
      setBusy(null);
    }
  }, [client, floorPlanObjectId, load, printTent, showToast, tableLabel]);

  const handleTurnOff = useCallback(async () => {
    setBusy("off");
    try {
      const { error } = await FloorPlanService.revokeTableQrCode(
        client,
        floorPlanObjectId,
      );
      if (error) {
        showToast({ title: "QR Error", message: error?.message ?? "Failed to turn off QR", type: "error" });
        return;
      }
      await load();
      showToast({ title: "QR Off", message: `QR ordering turned off for ${tableLabel} — the printed tent no longer works.`, type: "success" });
    } finally {
      setBusy(null);
    }
  }, [client, floorPlanObjectId, load, showToast, tableLabel]);

  const handleTurnOn = useCallback(async () => {
    // Re-enabling always mints a new token; print the new tent right away.
    setBusy("on");
    try {
      const { data, error } = await FloorPlanService.generateTableQrCode(
        client,
        { floorPlanObjectId, regenerate: false },
      );
      if (error || !data?.token) {
        showToast({ title: "QR Error", message: error?.message ?? "Failed to turn on QR", type: "error" });
        return;
      }
      await load();
      showToast({ title: "QR On", message: `QR ordering turned on for ${tableLabel}`, type: "success" });
      await printTent(data.token);
    } finally {
      setBusy(null);
    }
  }, [client, floorPlanObjectId, load, printTent, showToast, tableLabel]);

  const confirmCopy: Record<
    Exclude<ConfirmKind, null>,
    { title: string; body: string; cta: string; run: () => void }
  > = {
    regenerate: {
      title: "Regenerate QR code?",
      body: `The QR tent currently printed for ${tableLabel} will stop working. A new tent will print.`,
      cta: "Regenerate & Print",
      run: handleRegenerate,
    },
    turn_off: {
      title: "Turn off QR ordering?",
      body: `Guests will no longer be able to order from the printed tent at ${tableLabel}. Turning it back on requires printing a new tent.`,
      cta: "Turn Off",
      run: handleTurnOff,
    },
    turn_on: {
      title: "Turn on QR ordering?",
      body: `A new QR code will be created for ${tableLabel} and a new tent will print. Any previously printed tent stays dead.`,
      cta: "Turn On & Print",
      run: handleTurnOn,
    },
  };

  const requestGated = (kind: Exclude<ConfirmKind, null>) => setConfirmKind(kind);

  const hasActive = !!activeCode;

  const ActionRow = ({
    icon,
    label,
    sub,
    onPress,
    disabled,
    danger,
    busyKey,
  }: {
    icon: React.ReactNode;
    label: string;
    sub?: string;
    onPress: () => void;
    disabled?: boolean;
    danger?: boolean;
    busyKey?: string;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy !== null}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(12),
        paddingVertical: s(14),
        paddingHorizontal: s(16),
        borderRadius: s(12),
        borderWidth: 1,
        borderColor: danger ? colors.danger : colors.border,
        opacity: disabled ? 0.45 : 1,
        marginBottom: s(10),
        backgroundColor: colors.card,
      }}
    >
      {busy === busyKey ? (
        <ActivityIndicator size="small" color={QR_BRAND_BLUE} />
      ) : (
        icon
      )}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: danger ? colors.danger : colors.heading,
            fontWeight: "600",
            fontSize: s(15),
          }}
        >
          {label}
        </Text>
        {sub ? (
          <Text style={{ color: colors.label, fontSize: s(12), marginTop: s(2) }}>
            {sub}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  const confirm = confirmKind ? confirmCopy[confirmKind] : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: s(440),
            maxWidth: "92%",
            backgroundColor: colors.background,
            borderRadius: s(16),
            padding: s(20),
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: s(16),
              gap: s(10),
            }}
          >
            <QrCode size={s(20)} color={QR_BRAND_BLUE} />
            <Text
              style={{
                flex: 1,
                color: colors.heading,
                fontSize: s(17),
                fontWeight: "700",
              }}
            >
              QR Ordering — {tableLabel}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={s(20)} color={colors.label} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={QR_BRAND_BLUE} style={{ marginVertical: s(30) }} />
          ) : loadError ? (
            <Text style={{ color: colors.danger, marginBottom: s(12) }}>
              {loadError}
            </Text>
          ) : (
            <>
              {/* Status line */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(8),
                  marginBottom: s(14),
                }}
              >
                {hasActive ? (
                  <CheckCircle2 size={s(15)} color={colors.success} />
                ) : (
                  <Ban size={s(15)} color={colors.label} />
                )}
                <Text style={{ color: colors.label, fontSize: s(13) }}>
                  {hasActive
                    ? `QR is ON · code v${activeCode?.token_version} · ${activeCode?.scan_count ?? 0} scans`
                    : "QR is OFF for this table — no active code"}
                </Text>
              </View>

              {storeGateReason ? (
                <Text
                  style={{
                    color: colors.warning,
                    fontSize: s(13),
                    marginBottom: s(12),
                  }}
                >
                  {storeGateReason}
                </Text>
              ) : null}

              <ActionRow
                icon={<Printer size={s(18)} color={QR_BRAND_BLUE} />}
                label={hasActive ? "Reprint QR Tent" : "Print QR Tent"}
                sub={
                  hasActive
                    ? "Prints the same code already in use"
                    : "Creates this table's QR code and prints it"
                }
                onPress={handlePrintOrReprint}
                disabled={!!storeGateReason}
                busyKey="print"
              />

              {hasActive ? (
                <ActionRow
                  icon={<Eye size={s(18)} color={colors.label} />}
                  label="Preview"
                  sub="Show the guest QR on screen"
                  onPress={() => setPreviewOpen(true)}
                  disabled={!activeQrUrl}
                />
              ) : null}

              {hasActive ? (
                <ActionRow
                  icon={<RefreshCcw size={s(18)} color={colors.warning} />}
                  label="Regenerate QR Code"
                  sub="Manager only — old printed tent stops working"
                  onPress={() => requestGated("regenerate")}
                  disabled={!!storeGateReason}
                  busyKey="regenerate"
                />
              ) : null}

              <ActionRow
                icon={
                  hasActive ? (
                    <Ban size={s(18)} color={colors.danger} />
                  ) : (
                    <QrCode size={s(18)} color={colors.success} />
                  )
                }
                label={hasActive ? "Turn Off QR (this table)" : "Turn On QR (this table)"}
                sub="Manager only"
                onPress={() => requestGated(hasActive ? "turn_off" : "turn_on")}
                disabled={!hasActive && !!storeGateReason}
                danger={hasActive}
                busyKey={hasActive ? "off" : "on"}
              />
            </>
          )}
        </Pressable>
      </Pressable>

      {/* Confirm dialog for gated actions */}
      {confirm ? (
        <Modal transparent animationType="fade" onRequestClose={() => setConfirmKind(null)}>
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.55)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: s(380),
                maxWidth: "88%",
                backgroundColor: colors.background,
                borderRadius: s(14),
                padding: s(20),
              }}
            >
              <Text
                style={{
                  color: colors.heading,
                  fontSize: s(16),
                  fontWeight: "700",
                  marginBottom: s(8),
                }}
              >
                {confirm.title}
              </Text>
              <Text style={{ color: colors.label, fontSize: s(13), marginBottom: s(18) }}>
                {confirm.body}
              </Text>
              <View style={{ flexDirection: "row", gap: s(10) }}>
                <TouchableOpacity
                  onPress={() => setConfirmKind(null)}
                  style={{
                    flex: 1,
                    paddingVertical: s(12),
                    borderRadius: s(10),
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: colors.heading, fontWeight: "600" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const kind = confirmKind;
                    setConfirmKind(null);
                    setPinFor(kind);
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: s(12),
                    borderRadius: s(10),
                    backgroundColor:
                      confirmKind === "turn_off" ? colors.danger : QR_BRAND_BLUE,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>{confirm.cta}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      {/* Manager PIN gate */}
      <ManagerPinPrompt
        visible={pinFor !== null}
        subtitle={
          pinFor === "regenerate"
            ? `Regenerate QR for ${tableLabel}`
            : pinFor === "turn_off"
              ? `Turn off QR for ${tableLabel}`
              : `Turn on QR for ${tableLabel}`
        }
        onApproved={() => {
          const kind = pinFor;
          setPinFor(null);
          if (kind) confirmCopy[kind].run();
        }}
        onCancel={() => setPinFor(null)}
      />

      {/* On-screen preview / printer-offline fallback */}
      <Modal
        visible={previewOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewOpen(false)}
      >
        <Pressable
          onPress={() => setPreviewOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: "#fff",
              borderRadius: s(16),
              padding: s(24),
              alignItems: "center",
              gap: s(14),
            }}
          >
            <Text style={{ fontSize: s(20), fontWeight: "800", color: "#111" }}>
              {tableLabel}
            </Text>
            {activeQrUrl ? (
              <QRCode value={activeQrUrl} size={s(220)} />
            ) : (
              <Text style={{ color: "#666" }}>No active QR code</Text>
            )}
            <Text style={{ fontSize: s(14), fontWeight: "600", color: "#111" }}>
              Scan to order
            </Text>
            <Text style={{ fontSize: s(12), color: "#666" }}>
              {storeConfig?.store_name || selectedStore?.name || ""}
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
};

export default TableQrSheet;
