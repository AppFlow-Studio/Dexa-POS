// ============================================================
// Pre-Auth Payment View — Open Tab / Increase Tab / Close Tab
// ============================================================

import { colors } from "@/lib/theme";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useOrderPreAuth, useHasActivePreAuth } from "@/stores/selectors/orderSelectors";
import { useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { toastService } from "@/lib/toastService";
import { openTab, increaseTab, closeTab, releaseTab } from "@/services/preAuthService";
import { getSharedCastlesService } from "@/services/terminals/castles-service";
import { DejavooSpinAPI } from "@/lib/payments/dejavoo-spin-api";
import { CASTLES_DEFAULT_PORT } from "@/types/castles";
import {
  ArrowLeft,
  CreditCard,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react-native";
import React, { useState, useMemo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const PreAuthPaymentView: React.FC = () => {
  const setView = usePaymentStore((s) => s.setView);
  const close = usePaymentStore((s) => s.close);
  const preAuthMode = usePaymentStore((s) => s.preAuthMode);
  const setPreAuthMode = usePaymentStore((s) => s.setPreAuthMode);
  const setTransactionProcessing = usePaymentStore((s) => s.setTransactionProcessing);

  const activeOrder = useActiveOrder();
  const orderId = activeOrder?.id;
  const totals = useActiveOrderTotals();
  const preAuth = useOrderPreAuth(orderId);
  const hasPreAuth = useHasActivePreAuth(orderId);

  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const preAuthSettings = useStoreSettingsStore((s) => (s as any).preAuthSettings);
  const defaultAmount = preAuthSettings?.defaultPreAuthAmount ?? 25;

  const supabase = useSupabaseClient();

  // Determine mode from state
  const mode = preAuthMode ?? (hasPreAuth ? "capture" : "open");

  const [amount, setAmount] = useState(() => {
    if (mode === "open") return String(defaultAmount);
    if (mode === "increment") return String(preAuth?.preAuthAmount ?? defaultAmount);
    // Capture mode: default to remaining balance
    return String(totals?.amountDue ?? totals?.total ?? 0);
  });
  const [tipAmount, setTipAmount] = useState("0");
  const [isProcessing, setIsProcessing] = useState(false);

  const parsedAmount = parseFloat(amount) || 0;
  const parsedTip = parseFloat(tipAmount) || 0;

  // Tab exceeds hold warning
  const outstandingAmount = totals?.amountDue ?? totals?.total ?? 0;
  const exceedsHold = hasPreAuth && totals && preAuth
    ? outstandingAmount > (preAuth.preAuthAmount ?? 0)
    : false;

  const handleBack = () => {
    setPreAuthMode(null);
    setView("payment-method-selection");
  };

  /**
   * Build a terminal instance from the station's payment_terminal config.
   * Follows the same pattern as CardPaymentView.
   */
  const buildTerminalInstance = async () => {
    const terminal = selectedStation?.payment_terminal;
    if (!terminal) {
      throw new Error("No payment terminal selected");
    }

    if (terminal.terminal_type === "castles") {
      const host = terminal.ip_address;
      if (!host) throw new Error("Castles terminal has no IP address configured");
      const port = terminal.port ?? CASTLES_DEFAULT_PORT;

      const service = getSharedCastlesService();
      await service.connect({ host, port, timeout: 120_000, terminalId: terminal.id });
      await service.resetTerminalState();

      return { type: "castles" as const, service };
    } else {
      const api = new DejavooSpinAPI(supabase);
      const loaded = await api.loadTerminal(terminal.id || "", terminal);
      if (!loaded) throw new Error("Failed to load terminal credentials");

      return { type: "dejavoo" as const, api };
    }
  };

  const handleOpenTab = async () => {
    if (!orderId || parsedAmount <= 0) {
      toastService.show({ title: "Invalid Amount", message: "Enter a valid hold amount", type: "error" });
      return;
    }

    if (!selectedStation?.payment_terminal) {
      toastService.show({ title: "No Terminal", message: "No payment terminal selected", type: "error" });
      return;
    }

    setIsProcessing(true);
    setTransactionProcessing(true);

    try {
      toastService.show({
        title: "Present Card",
        message: `Hold $${parsedAmount.toFixed(2)} — tap or insert card on terminal`,
        type: "warning",
        duration: 5000,
      });

      const terminalInstance = await buildTerminalInstance();
      const result = await openTab(orderId, parsedAmount, terminalInstance, supabase);

      if (!result.success) {
        throw new Error(result.error || "Pre-auth declined");
      }

      toastService.show({
        title: "Tab Opened",
        message: `$${parsedAmount.toFixed(2)} hold placed successfully`,
        type: "success",
      });
      close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to open tab";
      toastService.show({ title: "Pre-Auth Failed", message: msg, type: "error" });
    } finally {
      setIsProcessing(false);
      setTransactionProcessing(false);
    }
  };

  const handleIncreaseTab = async () => {
    if (!orderId || !preAuth?.id || parsedAmount <= 0) return;

    if (!selectedStation?.payment_terminal) {
      toastService.show({ title: "No Terminal", message: "No payment terminal selected", type: "error" });
      return;
    }

    setIsProcessing(true);
    setTransactionProcessing(true);

    try {
      toastService.show({
        title: "Increasing Hold",
        message: `Updating hold to $${parsedAmount.toFixed(2)}...`,
        type: "warning",
      });

      const terminalInstance = await buildTerminalInstance();
      const result = await increaseTab(orderId, preAuth.id, parsedAmount, terminalInstance, supabase);

      if (!result.success) {
        throw new Error(result.error || "Incremental auth failed");
      }

      toastService.show({
        title: "Hold Updated",
        message: `Hold increased to $${parsedAmount.toFixed(2)}`,
        type: "success",
      });
      setPreAuthMode("capture");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to increase tab";
      toastService.show({ title: "Increment Failed", message: msg, type: "error" });
    } finally {
      setIsProcessing(false);
      setTransactionProcessing(false);
    }
  };

  const handleCloseTab = async () => {
    if (!orderId || !preAuth?.id) return;

    if (!selectedStation?.payment_terminal) {
      toastService.show({ title: "No Terminal", message: "No payment terminal selected", type: "error" });
      return;
    }

    setIsProcessing(true);
    setTransactionProcessing(true);

    try {
      toastService.show({
        title: "Capturing Payment",
        message: `Charging $${(parsedAmount + parsedTip).toFixed(2)}...`,
        type: "warning",
      });

      const terminalInstance = await buildTerminalInstance();
      const result = await closeTab(orderId, preAuth.id, parsedAmount, parsedTip, terminalInstance, supabase);

      if (!result.success) {
        throw new Error(result.error || "Capture failed");
      }

      toastService.show({
        title: "Payment Captured",
        message: `$${(result.capturedAmount! + (result.tipAmount ?? 0)).toFixed(2)} charged successfully`,
        type: "success",
      });
      setView("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to close tab";
      toastService.show({ title: "Capture Failed", message: msg, type: "error" });
    } finally {
      setIsProcessing(false);
      setTransactionProcessing(false);
    }
  };

  const handleReleaseTab = async () => {
    if (!orderId || !preAuth?.id) return;

    if (!selectedStation?.payment_terminal) {
      toastService.show({ title: "No Terminal", message: "No payment terminal selected", type: "error" });
      return;
    }

    setIsProcessing(true);
    setTransactionProcessing(true);

    try {
      toastService.show({
        title: "Releasing Hold",
        message: "Voiding pre-authorization...",
        type: "warning",
      });

      const terminalInstance = await buildTerminalInstance();
      const result = await releaseTab(orderId, preAuth.id, terminalInstance, supabase);

      if (!result.success) {
        throw new Error(result.error || "Failed to release hold");
      }

      toastService.show({
        title: "Tab Released",
        message: "Pre-authorization hold has been voided",
        type: "success",
      });
      setPreAuthMode(null);
      setView("payment-method-selection");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to release tab";
      toastService.show({ title: "Void Failed", message: msg, type: "error" });
    } finally {
      setIsProcessing(false);
      setTransactionProcessing(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  const renderModeHeader = () => {
    switch (mode) {
      case "open":
        return { title: "Open Tab", subtitle: "Place a hold on customer's card", icon: CreditCard, color: colors.teal };
      case "increment":
        return { title: "Increase Tab", subtitle: "Increase the card hold amount", icon: TrendingUp, color: colors.warning };
      case "capture":
        return { title: "Close Tab", subtitle: "Capture the final payment", icon: CheckCircle, color: colors.success };
      default:
        return { title: "Pre-Auth", subtitle: "", icon: CreditCard, color: colors.teal };
    }
  };

  const header = renderModeHeader();
  const HeaderIcon = header.icon;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} disabled={isProcessing}>
          <ArrowLeft size={18} color={colors.label} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{header.title}</Text>
          <Text style={styles.headerSub}>{header.subtitle}</Text>
        </View>
        <View style={[styles.iconBadge, { backgroundColor: `${header.color}20` }]}>
          <HeaderIcon size={20} color={header.color} />
        </View>
      </View>

      {/* Exceed Warning */}
      {exceedsHold && preAuth && (
        <View style={styles.warningBanner}>
          <AlertTriangle size={16} color={colors.warning} />
          <Text style={styles.warningText}>
            Tab (${outstandingAmount.toFixed(2)}) exceeds hold (${preAuth.preAuthAmount?.toFixed(2)})
          </Text>
          {preAuth.preAuthTerminalType === "castles" && (
            <TouchableOpacity
              onPress={() => { setPreAuthMode("increment"); setAmount(String(totals?.amountDue ?? totals?.total ?? 0)); }}
              style={styles.warningAction}
            >
              <Text style={styles.warningActionText}>Increase Hold</Text>
            </TouchableOpacity>
          )}
          {preAuth.preAuthTerminalType === "dejavoo" && (
            <Text style={styles.warningInfo}>Hold will be adjusted at close</Text>
          )}
        </View>
      )}

      {/* Active Pre-Auth Info */}
      {hasPreAuth && preAuth && mode !== "open" && (
        <View style={styles.preAuthInfo}>
          <View style={styles.preAuthRow}>
            <Text style={styles.preAuthLabel}>Current Hold</Text>
            <Text style={styles.preAuthValue}>${preAuth.preAuthAmount?.toFixed(2)}</Text>
          </View>
          <View style={styles.preAuthRow}>
            <Text style={styles.preAuthLabel}>Terminal</Text>
            <Text style={styles.preAuthValue}>{preAuth.preAuthTerminalType === "castles" ? "Castles" : "Dejavoo"}</Text>
          </View>
          {preAuth.preAuthRrn && (
            <View style={styles.preAuthRow}>
              <Text style={styles.preAuthLabel}>RRN</Text>
              <Text style={styles.preAuthValue}>{preAuth.preAuthRrn}</Text>
            </View>
          )}
        </View>
      )}

      {/* Amount Input */}
      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>
          {mode === "open" ? "Hold Amount" : mode === "increment" ? "New Hold Amount" : "Charge Amount"}
        </Text>
        <View style={styles.amountRow}>
          <Text style={styles.dollarSign}>$</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.muted}
            editable={!isProcessing}
          />
        </View>
      </View>

      {/* Tip Input (capture mode only) */}
      {mode === "capture" && (
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Tip Amount</Text>
          <View style={styles.amountRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.amountInput}
              value={tipAmount}
              onChangeText={setTipAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              editable={!isProcessing}
            />
          </View>
          {parsedTip > 0 && (
            <Text style={styles.totalText}>
              Total: ${(parsedAmount + parsedTip).toFixed(2)}
            </Text>
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.footer}>
        {mode === "open" && (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.teal }]}
            onPress={handleOpenTab}
            disabled={isProcessing || parsedAmount <= 0}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.primaryBtnText}>Hold Card — ${parsedAmount.toFixed(2)}</Text>
            )}
          </TouchableOpacity>
        )}

        {mode === "increment" && (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.warning }]}
            onPress={handleIncreaseTab}
            disabled={isProcessing || parsedAmount <= 0}
            activeOpacity={0.8}
          >
            {isProcessing ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.primaryBtnText}>Increase to ${parsedAmount.toFixed(2)}</Text>
            )}
          </TouchableOpacity>
        )}

        {mode === "capture" && (
          <>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.success }]}
              onPress={handleCloseTab}
              disabled={isProcessing || parsedAmount <= 0}
              activeOpacity={0.8}
            >
              {isProcessing ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  Charge ${(parsedAmount + parsedTip).toFixed(2)}
                </Text>
              )}
            </TouchableOpacity>

            {/* Secondary actions for capture mode */}
            <View style={styles.secondaryActions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => { setPreAuthMode("increment"); setAmount(String(totals?.amountDue ?? totals?.total ?? 0)); }}
                disabled={isProcessing}
              >
                <TrendingUp size={14} color={colors.warning} />
                <Text style={[styles.secondaryBtnText, { color: colors.warning }]}>Increase Tab</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleReleaseTab}
                disabled={isProcessing}
              >
                <XCircle size={14} color={colors.danger} />
                <Text style={[styles.secondaryBtnText, { color: colors.danger }]}>Release Tab</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.screen },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  headerTitle: { fontSize: 15, fontWeight: "700", color: colors.heading },
  headerSub: { fontSize: 11, color: colors.muted, marginTop: 1 },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    marginHorizontal: 14,
    marginTop: 10,
    backgroundColor: `${colors.warning}15`,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${colors.warning}40`,
    gap: 8,
  },
  warningText: { flex: 1, fontSize: 12, color: colors.warning, fontWeight: "600" },
  warningAction: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: `${colors.warning}30`,
    borderRadius: 6,
  },
  warningActionText: { fontSize: 11, fontWeight: "700", color: colors.warning },
  warningInfo: { fontSize: 11, color: colors.muted, fontStyle: "italic" },
  preAuthInfo: {
    margin: 14,
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  preAuthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  preAuthLabel: { fontSize: 12, color: colors.muted },
  preAuthValue: { fontSize: 12, fontWeight: "600", color: colors.heading },
  inputSection: {
    paddingHorizontal: 14,
    paddingTop: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  dollarSign: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.heading,
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: colors.heading,
    paddingVertical: 12,
  },
  totalText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.teal,
    marginTop: 8,
    textAlign: "right",
  },
  footer: {
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 20,
    gap: 10,
  },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
  },
  secondaryActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
});

export default PreAuthPaymentView;
