/**
 * CashDrawerSheet
 *
 * Full cash drawer lifecycle: Open -> Active (view operations) -> Close with variance display.
 * Presented as a bottom sheet modal.
 */

import DenominationCounter from "@/components/cash-drawer/DenominationCounter";
import NoSaleModal from "@/components/cash-drawer/NoSaleModal";
import PayInOutModal from "@/components/cash-drawer/PayInOutModal";
import { colors, bottomSheetTheme } from "@/lib/theme";
import { formatCurrency } from "@/utils/currency";
import {
  closeDrawerSession,
  openDrawerSession,
} from "@/services/cashDrawerService";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  DenominationCount,
  isDebitOperation,
  isNoEffectOperation,
  useCashDrawerStore,
} from "@/stores/useCashDrawerStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useOrderStore } from "@/stores/useOrderStore";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  ExternalLink,
  Inbox,
  Lock,
  Receipt,
  Unlock,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

interface CashDrawerSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

type DrawerView = "open" | "active" | "close" | "close_summary";

const OP_LABELS: Record<string, string> = {
  cash_sale: "Cash Sale",
  pay_in: "Pay In",
  pay_out: "Pay Out",
  cash_drop: "Cash Drop",
  no_sale: "No Sale",
  cash_refund: "Cash Refund",
  opening_count: "Opening Count",
  closing_count: "Closing Count",
  tip_out: "Tip Out",
};

const OP_COLORS: Record<string, { bg: string; text: string }> = {
  cash_sale:     { bg: "bg-green-900/40",  text: "text-green-400" },
  cash_refund:   { bg: "bg-red-900/40",    text: "text-red-400" },
  pay_in:        { bg: "bg-green-900/40",  text: "text-green-400" },
  pay_out:       { bg: "bg-red-900/40",    text: "text-red-400" },
  cash_drop:     { bg: "bg-blue-900/40",   text: "text-blue-400" },
  tip_out:       { bg: "bg-red-900/40",    text: "text-red-400" },
  no_sale:       { bg: "bg-gray-800",      text: "text-gray-400" },
  opening_count: { bg: "bg-gray-800",      text: "text-gray-400" },
  closing_count: { bg: "bg-gray-800",      text: "text-gray-400" },
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

const CashDrawerSheet: React.FC<CashDrawerSheetProps> = ({
  isOpen,
  onClose,
}) => {
  const router = useRouter();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const supabase = useSupabaseClient();

  const activeSession = useCashDrawerStore((s) => s.activeSession);
  const operations = useCashDrawerStore((s) => s.operations);
  const drawerId = useCashDrawerStore((s) => s.drawerId);
  const drawerName = useCashDrawerStore((s) => s.drawerName);
  const getRunningBalance = useCashDrawerStore((s) => s.getRunningBalance);
  const getVariance = useCashDrawerStore((s) => s.getVariance);

  const loggedInEmployee = useEmployeeStore((s) => s.loggedInEmployee);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const cashDrawerSettings = useStoreSettingsStore((s) => s.cashDrawerSettings);

  const [view, setView] = useState<DrawerView>(
    activeSession?.status === "open" ? "active" : "open"
  );
  const [openingTotal, setOpeningTotal] = useState(0);
  const [openingDetails, setOpeningDetails] = useState<DenominationCount[]>([]);
  const [closingTotal, setClosingTotal] = useState(0);
  const [closingDetails, setClosingDetails] = useState<DenominationCount[]>([]);
  const [varianceNotes, setVarianceNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQuickStart, setIsQuickStart] = useState(false);
  const [quickStartAmount, setQuickStartAmount] = useState(
    String(cashDrawerSettings.defaultOpeningAmount)
  );

  // Sub-modal states — rendered OUTSIDE the BottomSheetModal so they appear above it
  const [payInOutMode, setPayInOutMode] = useState<"pay_in" | "pay_out" | "cash_drop">("pay_in");
  const [isPayInOutOpen, setPayInOutOpen] = useState(false);
  const [isNoSaleOpen, setNoSaleOpen] = useState(false);

  // Close summary data
  const [closeSummary, setCloseSummary] = useState<{
    expected: number;
    actual: number;
    variance: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      bottomSheetRef.current?.present();
      setView(activeSession?.status === "open" ? "active" : "open");
      setCloseSummary(null);
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [isOpen, activeSession?.status]);

  const handleOpen = useCallback(async () => {
    if (!drawerId || !selectedStore || !loggedInEmployee) return;
    setIsSubmitting(true);

    const amount = isQuickStart
      ? parseFloat(quickStartAmount) || 0
      : openingTotal;
    const details = isQuickStart ? undefined : openingDetails;

    const result = await openDrawerSession(supabase, {
      cashDrawerId: drawerId,
      merchantId: selectedStore.merchant_id,
      locationId: selectedStore.id,
      openedBy: loggedInEmployee.profileId,
      openingAmount: amount,
      openingCountDetails: details,
    });

    setIsSubmitting(false);
    if (result.success) {
      setView("active");
    }
  }, [drawerId, selectedStore, loggedInEmployee, openingTotal, openingDetails, isQuickStart, quickStartAmount, supabase]);

  const handleClose = useCallback(async () => {
    if (!activeSession || !drawerId || !loggedInEmployee) return;
    setIsSubmitting(true);

    const expected = getRunningBalance();
    const result = await closeDrawerSession(supabase, {
      sessionId: activeSession.id,
      cashDrawerId: drawerId,
      closedBy: loggedInEmployee.profileId,
      closingAmount: closingTotal,
      closingCountDetails: closingDetails,
      varianceNotes: varianceNotes || undefined,
    });

    setIsSubmitting(false);
    if (result.success) {
      if (cashDrawerSettings.blindCloseCount) {
        setCloseSummary({
          expected,
          actual: closingTotal,
          variance: result.variance ?? closingTotal - expected,
        });
        setView("close_summary");
      } else {
        onClose();
      }
    }
  }, [activeSession, drawerId, loggedInEmployee, closingTotal, closingDetails, varianceNotes, supabase, onClose, cashDrawerSettings.blindCloseCount, getRunningBalance]);

  const openPayInOut = useCallback((mode: "pay_in" | "pay_out" | "cash_drop") => {
    setPayInOutMode(mode);
    setPayInOutOpen(true);
  }, []);

  const runningBalance = useMemo(() => getRunningBalance(), [operations, activeSession]);
  const variance = useMemo(() => getVariance(closingTotal), [closingTotal, operations, activeSession]);

  // Totals for the session summary bar
  const sessionTotals = useMemo(() => {
    let cashIn = 0;
    let cashOut = 0;
    let sales = 0;
    for (const op of operations) {
      if (isNoEffectOperation(op.operationType)) continue;
      if (op.operationType === "cash_sale") {
        sales += op.amount;
        cashIn += op.amount;
      } else if (isDebitOperation(op.operationType)) {
        cashOut += op.amount;
      } else {
        cashIn += op.amount;
      }
    }
    return { cashIn, cashOut, sales };
  }, [operations]);

  const recentOps = useMemo(() => [...operations].reverse().slice(0, 30), [operations]);

  const isBlind = cashDrawerSettings.blindCloseCount;
  const { varianceWarningThreshold, varianceAlertThreshold } = cashDrawerSettings;

  const getVarianceColor = (v: number) => {
    const abs = Math.abs(v);
    if (abs === 0) return "text-green-400";
    if (abs >= varianceAlertThreshold) return "text-red-400";
    if (abs >= varianceWarningThreshold) return "text-yellow-400";
    return "text-blue-400";
  };

  // ── Open view ──────────────────────────────────────────────────────────────
  const renderOpenView = () => (
    <View>
      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading, marginBottom: 2 }}>Open Cash Drawer</Text>
      <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 12 }}>
        Count the cash to start your session.
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Text style={{ fontSize: 12, color: colors.label }}>Quick Start</Text>
        <TouchableOpacity
          onPress={() => setIsQuickStart(!isQuickStart)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: isQuickStart ? colors.teal + "50" : colors.border,
            backgroundColor: isQuickStart ? colors.teal + "20" : colors.screen,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "600", color: isQuickStart ? colors.teal : colors.label }}>
            {isQuickStart ? "On" : "Off"}
          </Text>
        </TouchableOpacity>
      </View>

      {isQuickStart ? (
        <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: colors.label, marginBottom: 8 }}>Opening Amount</Text>
          <TextInput
            value={quickStartAmount}
            onChangeText={setQuickStartAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.muted}
            style={{
              height: 40,
              paddingHorizontal: 12,
              backgroundColor: colors.inset,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              color: colors.heading,
              fontSize: 20,
              fontWeight: "700",
              textAlign: "center",
            }}
          />
        </View>
      ) : (
        <DenominationCounter
          onTotalChange={(total, details) => {
            setOpeningTotal(total);
            setOpeningDetails(details);
          }}
        />
      )}

      <TouchableOpacity
        onPress={handleOpen}
        disabled={isSubmitting}
        style={{
          marginTop: 14,
          paddingVertical: 11,
          borderRadius: 10,
          alignItems: "center",
          backgroundColor: isSubmitting ? colors.border : colors.teal,
          opacity: isSubmitting ? 0.6 : 1,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Unlock size={16} color={colors.onSolid} />
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSolid }}>
            {isSubmitting
              ? "Opening..."
              : `Open (${formatCurrency(isQuickStart ? parseFloat(quickStartAmount) || 0 : openingTotal)})`}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  // ── Active view ────────────────────────────────────────────────────────────
  const renderActiveView = () => (
    <View>
      {/* Header: name + balance + Close button */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <View>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
            {drawerName || "Cash Drawer"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success }} />
            <Text style={{ fontSize: 11, color: colors.success }}>Active</Text>
          </View>
        </View>
        {/* Balance + close — always visible at top */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 10, color: colors.muted }}>Balance</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.teal }}>
              {formatCurrency(runningBalance)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setView("close")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderRadius: 8,
              backgroundColor: colors.danger + "20",
              borderWidth: 1,
              borderColor: colors.danger + "40",
            }}
          >
            <Lock size={13} color={colors.danger} />
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.danger }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Session summary chips */}
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
        <View style={{ flex: 1, backgroundColor: colors.panel, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
          <Text style={{ fontSize: 9, color: colors.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>Sales</Text>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.teal, marginTop: 2 }}>{formatCurrency(sessionTotals.sales)}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.panel, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
          <Text style={{ fontSize: 9, color: colors.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>In</Text>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.teal, marginTop: 2 }}>{formatCurrency(sessionTotals.cashIn)}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.panel, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
          <Text style={{ fontSize: 9, color: colors.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>Out</Text>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.danger, marginTop: 2 }}>{formatCurrency(sessionTotals.cashOut)}</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.panel, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
          <Text style={{ fontSize: 9, color: colors.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>Ops</Text>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.heading, marginTop: 2 }}>{operations.length}</Text>
        </View>
      </View>

      {/* Operation Buttons */}
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
        <TouchableOpacity
          onPress={() => openPayInOut("pay_in")}
          style={{
            flex: 1,
            paddingVertical: 9,
            borderRadius: 10,
            backgroundColor: colors.teal + "20",
            borderWidth: 1,
            borderColor: colors.teal + "40",
            alignItems: "center",
          }}
        >
          <ArrowDownCircle size={16} color={colors.teal} />
          <Text style={{ fontSize: 10, fontWeight: "600", color: colors.teal, marginTop: 2 }}>Pay In</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => openPayInOut("pay_out")}
          style={{
            flex: 1,
            paddingVertical: 9,
            borderRadius: 10,
            backgroundColor: colors.danger + "20",
            borderWidth: 1,
            borderColor: colors.danger + "40",
            alignItems: "center",
          }}
        >
          <ArrowUpCircle size={16} color={colors.danger} />
          <Text style={{ fontSize: 10, fontWeight: "600", color: colors.danger, marginTop: 2 }}>Pay Out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => openPayInOut("cash_drop")}
          style={{
            flex: 1,
            paddingVertical: 9,
            borderRadius: 10,
            backgroundColor: colors.teal + "20",
            borderWidth: 1,
            borderColor: colors.teal + "40",
            alignItems: "center",
          }}
        >
          <Inbox size={16} color={colors.teal} />
          <Text style={{ fontSize: 10, fontWeight: "600", color: colors.teal, marginTop: 2 }}>Drop</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setNoSaleOpen(true)}
          style={{
            flex: 1,
            paddingVertical: 9,
            borderRadius: 10,
            backgroundColor: colors.teal + "20",
            borderWidth: 1,
            borderColor: colors.teal + "40",
            alignItems: "center",
          }}
        >
          <Banknote size={16} color={colors.teal} />
          <Text style={{ fontSize: 10, fontWeight: "600", color: colors.teal, marginTop: 2 }}>No Sale</Text>
        </TouchableOpacity>
      </View>

      {/* Operations list */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.heading }}>Transactions</Text>
        <Text style={{ fontSize: 10, color: colors.muted }}>{operations.length}</Text>
      </View>

      {recentOps.length === 0 ? (
        <View style={{ paddingVertical: 16, alignItems: "center" }}>
          <Receipt size={22} color={colors.muted} />
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>No transactions yet</Text>
        </View>
      ) : (
        recentOps.map((op) => {
          const isDebit = isDebitOperation(op.operationType);
          const isNoEffect = isNoEffectOperation(op.operationType);

          // Resolve order across both active and previous-orders stores.
          // Drawer operations often persist DB order IDs, while in-memory orders can be local IDs.
          const activeOrder = op.orderId
            ? useOrderStore.getState().getOrder(op.orderId)
            : null;
          const previousOrder = op.orderId
            ? usePreviousOrdersStore.getState().getOrderById(op.orderId)
            : null;

          const resolvedDisplayNumber =
            activeOrder?.display_number ||
            activeOrder?.order_number ||
            previousOrder?.display_number ||
            previousOrder?.order_number;

          const orderNumber = resolvedDisplayNumber
            ? String(resolvedDisplayNumber)
            : op.orderId
              ? `ORD-${op.orderId.slice(0, 6)}`
              : null;

          const handleCardPress = () => {
            if (op.orderId) {
              router.push(`/previous-orders/${op.orderId}`);
            }
          };

          return (
            <TouchableOpacity
              key={op.id}
              onPress={handleCardPress}
              disabled={!op.orderId}
              activeOpacity={op.orderId ? 0.7 : 1}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 9,
                borderRadius: 10,
                marginBottom: 6,
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: op.orderId ? colors.teal + "40" : colors.border,
              }}
            >
              {/* Top row: Type + Amount */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>
                  {OP_LABELS[op.operationType] ?? op.operationType.replace(/_/g, " ")}
                </Text>
                {/* Amount */}
                <Text style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: isNoEffect ? colors.muted : (isDebit ? colors.danger : colors.teal),
                }}>
                  {isNoEffect
                    ? "—"
                    : `${isDebit ? "-" : "+"}${formatCurrency(op.amount)}`}
                </Text>
              </View>

              {/* Bottom row: Order number + reason + time */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {orderNumber && (
                  <View style={{ backgroundColor: colors.teal + "15", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 10, color: colors.teal, fontWeight: "600" }}>{orderNumber}</Text>
                  </View>
                )}
                {op.reason && (
                  <Text style={{ fontSize: 10, color: colors.label }}>{op.reason}</Text>
                )}
                {op.performedAt && (
                  <Text style={{ fontSize: 9, color: colors.muted }}>
                    {formatTime(op.performedAt)}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );

  // ── Close view ─────────────────────────────────────────────────────────────
  const renderCloseView = () => (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <View>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading }}>Close Drawer</Text>
          <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>Count the cash to end your session</Text>
        </View>
        <TouchableOpacity
          onPress={() => setView("active")}
          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}
        >
          <Text style={{ fontSize: 11, color: colors.label }}>Back</Text>
        </TouchableOpacity>
      </View>

      <DenominationCounter
        onTotalChange={(total, details) => {
          setClosingTotal(total);
          setClosingDetails(details);
        }}
      />

      {/* Variance Display */}
      <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginTop: 12 }}>
        {!isBlind && (
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 12, color: colors.label }}>Expected</Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.heading }}>
              {formatCurrency(runningBalance)}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 12, color: colors.label }}>Counted</Text>
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.heading }}>
            {formatCurrency(closingTotal)}
          </Text>
        </View>
        {!isBlind && (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.heading }}>Variance</Text>
              <Text style={{
                fontSize: 13,
                fontWeight: "700",
                color: Math.abs(variance) === 0 ? colors.success : (Math.abs(variance) >= varianceAlertThreshold ? colors.danger : (Math.abs(variance) >= varianceWarningThreshold ? colors.warning : colors.info)),
              }}>
                {variance >= 0 ? "+" : ""}{formatCurrency(variance)}
              </Text>
            </View>
          </View>
        )}
      </View>

      <View style={{ marginTop: 10 }}>
        <Text style={{ fontSize: 11, color: colors.label, marginBottom: 6 }}>Notes (optional)</Text>
        <TextInput
          value={varianceNotes}
          onChangeText={setVarianceNotes}
          placeholder="Add variance notes..."
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={2}
          style={{
            minHeight: 40,
            paddingHorizontal: 10,
            paddingVertical: 8,
            backgroundColor: colors.inset,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            color: colors.heading,
            fontSize: 12,
            textAlignVertical: "top",
          }}
        />
      </View>

      <TouchableOpacity
        onPress={handleClose}
        disabled={isSubmitting}
        style={{
          marginTop: 12,
          paddingVertical: 11,
          borderRadius: 10,
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: 6,
          backgroundColor: isSubmitting ? colors.border : colors.danger,
          opacity: isSubmitting ? 0.6 : 1,
        }}
      >
        <Lock size={14} color={isSubmitting ? colors.muted : colors.onSolid} />
        <Text style={{ fontSize: 13, fontWeight: "700", color: isSubmitting ? colors.muted : colors.onSolid }}>
          {isSubmitting ? "Closing..." : "Confirm Close"}
        </Text>
      </TouchableOpacity>
    </View>
  );

  // ── Close summary ──────────────────────────────────────────────────────────
  const renderCloseSummary = () => {
    if (!closeSummary) return null;
    const v = closeSummary.variance;
    return (
      <View>
        <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading, marginBottom: 12, textAlign: "center" }}>
          Drawer Closed
        </Text>
        <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 12, color: colors.label }}>Expected</Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.heading }}>
              {formatCurrency(closeSummary.expected)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 12, color: colors.label }}>Actual</Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.heading }}>
              {formatCurrency(closeSummary.actual)}
            </Text>
          </View>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.heading }}>Variance</Text>
              <Text style={{
                fontSize: 13,
                fontWeight: "700",
                color: Math.abs(v) === 0 ? colors.success : (Math.abs(v) >= varianceAlertThreshold ? colors.danger : (Math.abs(v) >= varianceWarningThreshold ? colors.warning : colors.info)),
              }}>
                {v >= 0 ? "+" : ""}{formatCurrency(v)}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={onClose}
          style={{ paddingVertical: 11, borderRadius: 10, alignItems: "center", backgroundColor: colors.teal }}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSolid }}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <>
      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={["75%", "92%"]}
        onDismiss={onClose}
        enablePanDownToClose
        {...bottomSheetTheme}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.5}
          />
        )}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12, paddingBottom: 40 }}>
          {view === "open" && renderOpenView()}
          {view === "active" && renderActiveView()}
          {view === "close" && renderCloseView()}
          {view === "close_summary" && renderCloseSummary()}
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Rendered OUTSIDE BottomSheetModal so they appear above it */}
      <PayInOutModal
        isOpen={isPayInOutOpen}
        onClose={() => setPayInOutOpen(false)}
        mode={payInOutMode}
      />
      <NoSaleModal
        isOpen={isNoSaleOpen}
        onClose={() => setNoSaleOpen(false)}
      />
    </>
  );
};

export default CashDrawerSheet;
