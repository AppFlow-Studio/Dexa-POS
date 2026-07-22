/**
 * TableQrSheet — POS-side QR table ordering management for a single table.
 *
 * Opened from TableContextSheet's "QR Code" action. Two-pane layout:
 * live QR preview on the left (the exact guest URL), actions on the right:
 *  - Print / Reprint (same token when an active code exists)
 *  - Regenerate (manager PIN gated; rotates token, old tent stops working)
 *  - QR On/Off for this table (manager PIN gated; Off = revoke, On = new code)
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
  AlertTriangle,
  Ban,
  Power,
  Printer,
  QrCode,
  RefreshCcw,
  ScanLine,
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
    if (codeRes.error)
      setLoadError(codeRes.error.message ?? "Failed to load QR state");
    else setActiveCode(codeRes.data);
    if (cfgRes.error)
      setLoadError(cfgRes.error.message ?? "Failed to load store config");
    else setStoreConfig(cfgRes.data);
    setLoading(false);
  }, [client, floorPlanObjectId, locationId]);

  useEffect(() => {
    if (visible) {
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
        showToast({
          title: "QR Error",
          message: "Could not build the guest URL for this QR code.",
          type: "error",
        });
        return false;
      }
      const printed = await PrinterService.printTableQr({
        tableLabel,
        storeName: storeConfig.store_name || selectedStore?.name || "",
        qrData: qrUrl,
        locationId,
      });
      if (printed) {
        showToast({
          title: "Printing",
          message: `QR tent queued to print for ${tableLabel}`,
          type: "success",
        });
      } else {
        // The code is already saved server-side; the on-screen QR in this
        // sheet doubles as the fallback — guests can scan it directly.
        showToast({
          title: "Printer Offline",
          message:
            "No receipt printer available — guests can scan the QR on screen.",
          type: "warning",
        });
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
        showToast({
          title: "QR Error",
          message: error?.message ?? "Failed to generate QR code",
          type: "error",
        });
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
        showToast({
          title: "QR Error",
          message: error?.message ?? "Failed to regenerate QR code",
          type: "error",
        });
        return;
      }
      await load();
      showToast({
        title: "QR Regenerated",
        message: `The old printed code for ${tableLabel} no longer works.`,
        type: "success",
      });
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
        showToast({
          title: "QR Error",
          message: error?.message ?? "Failed to turn off QR",
          type: "error",
        });
        return;
      }
      await load();
      showToast({
        title: "QR Off",
        message: `QR ordering turned off for ${tableLabel} — the printed tent no longer works.`,
        type: "success",
      });
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
        showToast({
          title: "QR Error",
          message: error?.message ?? "Failed to turn on QR",
          type: "error",
        });
        return;
      }
      await load();
      showToast({
        title: "QR On",
        message: `QR ordering turned on for ${tableLabel}`,
        type: "success",
      });
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

  const requestGated = (kind: Exclude<ConfirmKind, null>) =>
    setConfirmKind(kind);

  const hasActive = !!activeCode;
  const confirm = confirmKind ? confirmCopy[confirmKind] : null;

  const ActionRow = ({
    icon,
    iconBg,
    label,
    sub,
    onPress,
    disabled,
    danger,
    busyKey,
  }: {
    icon: React.ReactNode;
    iconBg: string;
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
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(14),
        borderRadius: s(14),
        borderWidth: 1,
        borderColor: danger ? colors.danger + "40" : colors.border,
        opacity: disabled ? 0.45 : 1,
        marginBottom: s(10),
        backgroundColor: colors.card,
      }}
    >
      <View
        style={{
          width: s(38),
          height: s(38),
          borderRadius: s(12),
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: iconBg,
        }}
      >
        {busy === busyKey ? (
          <ActivityIndicator size="small" color={colors.teal} />
        ) : (
          icon
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: danger ? colors.danger : colors.heading,
            fontWeight: "700",
            fontSize: s(14),
          }}
        >
          {label}
        </Text>
        {sub ? (
          <Text
            style={{ color: colors.label, fontSize: s(11), marginTop: s(2) }}
          >
            {sub}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );

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
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: s(640),
            maxWidth: "94%",
            backgroundColor: colors.panel,
            borderRadius: s(20),
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(10),
              paddingHorizontal: s(18),
              paddingVertical: s(14),
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View
              style={{
                width: s(34),
                height: s(34),
                borderRadius: s(11),
                backgroundColor: colors.teal + "1A",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <QrCode size={s(18)} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: colors.heading,
                  fontSize: s(16),
                  fontWeight: "700",
                }}
              >
                QR Ordering
              </Text>
              <Text style={{ color: colors.muted, fontSize: s(12) }}>
                Table {tableLabel}
              </Text>
            </View>

            {/* Status chip */}
            {!loading && !loadError ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(6),
                  paddingHorizontal: s(10),
                  paddingVertical: s(5),
                  borderRadius: s(20),
                  backgroundColor: hasActive
                    ? colors.success + "1A"
                    : colors.muted + "1A",
                }}
              >
                <View
                  style={{
                    width: s(7),
                    height: s(7),
                    borderRadius: s(4),
                    backgroundColor: hasActive ? colors.success : colors.muted,
                  }}
                />
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: "700",
                    color: hasActive ? colors.success : colors.muted,
                  }}
                >
                  {hasActive ? "ACTIVE" : "OFF"}
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              style={{
                width: s(30),
                height: s(30),
                borderRadius: s(15),
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.screen,
              }}
            >
              <X size={s(15)} color={colors.label} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator
              color={colors.teal}
              style={{ marginVertical: s(60) }}
            />
          ) : loadError ? (
            <View style={{ padding: s(20) }}>
              <Text style={{ color: colors.danger }}>{loadError}</Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row" }}>
              {/* Left pane — live QR preview */}
              <View
                style={{
                  width: s(250),
                  alignItems: "center",
                  justifyContent: "center",
                  padding: s(20),
                  borderRightWidth: 1,
                  borderRightColor: colors.border,
                }}
              >
                <View
                  style={{
                    backgroundColor: "#ffffff",
                    borderRadius: s(16),
                    padding: s(16),
                    alignItems: "center",
                    gap: s(8),
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(18),
                      fontWeight: "800",
                      color: "#111",
                    }}
                  >
                    {tableLabel}
                  </Text>
                  {hasActive && activeQrUrl ? (
                    <QRCode value={activeQrUrl} size={s(150)} />
                  ) : (
                    <View
                      style={{
                        width: s(150),
                        height: s(150),
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "#F3F4F6",
                        borderRadius: s(10),
                      }}
                    >
                      <Ban size={s(36)} color="#9CA3AF" />
                      <Text
                        style={{
                          color: "#6B7280",
                          fontSize: s(11),
                          marginTop: s(8),
                          fontWeight: "600",
                        }}
                      >
                        QR is off
                      </Text>
                    </View>
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(5),
                    }}
                  >
                    <ScanLine size={s(12)} color="#374151" />
                    <Text
                      style={{
                        fontSize: s(11),
                        fontWeight: "700",
                        color: "#374151",
                      }}
                    >
                      Scan to order
                    </Text>
                  </View>
                </View>

                {hasActive ? (
                  <Text
                    style={{
                      color: colors.muted,
                      fontSize: s(11),
                      marginTop: s(12),
                    }}
                  >
                    v{activeCode?.token_version} · {activeCode?.scan_count ?? 0}{" "}
                    scans
                  </Text>
                ) : null}
              </View>

              {/* Right pane — actions */}
              <View style={{ flex: 1, padding: s(16) }}>
                {storeGateReason ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(8),
                      padding: s(10),
                      borderRadius: s(10),
                      backgroundColor: colors.warning + "14",
                      borderWidth: 1,
                      borderColor: colors.warning + "35",
                      marginBottom: s(12),
                    }}
                  >
                    <AlertTriangle size={s(14)} color={colors.warning} />
                    <Text
                      style={{
                        color: colors.warning,
                        fontSize: s(11),
                        flex: 1,
                        fontWeight: "600",
                      }}
                    >
                      {storeGateReason}
                    </Text>
                  </View>
                ) : null}

                <ActionRow
                  icon={<Printer size={s(17)} color={colors.teal} />}
                  iconBg={colors.teal + "1A"}
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
                    icon={<RefreshCcw size={s(17)} color={colors.warning} />}
                    iconBg={colors.warning + "1A"}
                    label="Regenerate QR Code"
                    sub="Manager only — old printed tent stops working"
                    onPress={() => requestGated("regenerate")}
                    disabled={!!storeGateReason}
                    busyKey="regenerate"
                  />
                ) : null}

                <ActionRow
                  icon={
                    <Power
                      size={s(17)}
                      color={hasActive ? colors.danger : colors.success}
                    />
                  }
                  iconBg={
                    hasActive ? colors.danger + "14" : colors.success + "1A"
                  }
                  label={hasActive ? "Turn Off QR" : "Turn On QR"}
                  sub={
                    hasActive
                      ? "Manager only — printed tent stops working"
                      : "Manager only — prints a new tent"
                  }
                  onPress={() => requestGated(hasActive ? "turn_off" : "turn_on")}
                  disabled={!hasActive && !!storeGateReason}
                  danger={hasActive}
                  busyKey={hasActive ? "off" : "on"}
                />
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>

      {/* Confirm dialog for gated actions */}
      {confirm ? (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmKind(null)}
        >
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
                backgroundColor: colors.panel,
                borderRadius: s(16),
                borderWidth: 1,
                borderColor: colors.border,
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
              <Text
                style={{
                  color: colors.label,
                  fontSize: s(13),
                  marginBottom: s(18),
                  lineHeight: s(19),
                }}
              >
                {confirm.body}
              </Text>
              <View style={{ flexDirection: "row", gap: s(10) }}>
                <TouchableOpacity
                  onPress={() => setConfirmKind(null)}
                  style={{
                    flex: 1,
                    paddingVertical: s(12),
                    borderRadius: s(12),
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: "center",
                    backgroundColor: colors.screen,
                  }}
                >
                  <Text style={{ color: colors.heading, fontWeight: "600" }}>
                    Cancel
                  </Text>
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
                    borderRadius: s(12),
                    backgroundColor:
                      confirmKind === "turn_off" ? colors.danger : colors.teal,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: colors.onSolid, fontWeight: "700" }}>
                    {confirm.cta}
                  </Text>
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
    </Modal>
  );
};

export default TableQrSheet;
