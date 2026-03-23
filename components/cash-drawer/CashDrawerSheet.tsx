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
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
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
      <Text className="text-xl font-bold text-white mb-2">Open Cash Drawer</Text>
      <Text className="text-sm text-label mb-4">
        Count the cash in the drawer to start your session.
      </Text>

      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-sm text-label">Quick Start (single amount)</Text>
        <TouchableOpacity
          onPress={() => setIsQuickStart(!isQuickStart)}
          className={`px-3 py-1.5 rounded-lg border ${
            isQuickStart ? "bg-blue-600 border-blue-500" : "bg-surface border-border"
          }`}
        >
          <Text className={`text-sm font-medium ${isQuickStart ? "text-white" : "text-label"}`}>
            {isQuickStart ? "On" : "Off"}
          </Text>
        </TouchableOpacity>
      </View>

      {isQuickStart ? (
        <View className="bg-surface border border-border rounded-xl p-4 mb-4">
          <Text className="text-sm text-label mb-2">Opening Amount</Text>
          <TextInput
            value={quickStartAmount}
            onChangeText={setQuickStartAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.muted}
            className="h-14 px-4 bg-panel border border-border rounded-lg text-white text-2xl text-center"
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
        className={`mt-4 py-4 rounded-xl items-center ${isSubmitting ? "bg-gray-600" : "bg-teal"}`}
      >
        <View className="flex-row items-center gap-2">
          <Unlock size={20} color="black" />
          <Text className="text-lg font-bold text-black">
            {isSubmitting
              ? "Opening..."
              : `Open Drawer (${formatCurrency(isQuickStart ? parseFloat(quickStartAmount) || 0 : openingTotal)})`}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  // ── Active view ────────────────────────────────────────────────────────────
  const renderActiveView = () => (
    <View>
      {/* Header: name + balance + Close button */}
      <View className="flex-row items-center justify-between mb-3">
        <View>
          <Text className="text-lg font-bold text-white">
            {drawerName || "Cash Drawer"}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-0.5">
            <View className="w-2 h-2 rounded-full bg-green-400" />
            <Text className="text-xs text-green-400">Session Active</Text>
          </View>
        </View>
        {/* Balance + close — always visible at top */}
        <View className="flex-row items-center gap-3">
          <View className="items-end">
            <Text className="text-xs text-label">Balance</Text>
            <Text className="text-xl font-bold text-teal">
              {formatCurrency(runningBalance)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setView("close")}
            className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-red-900/60 border border-red-700"
          >
            <Lock size={16} color="#f87171" />
            <Text className="text-sm font-bold text-red-400">Close</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Session summary chips */}
      <View className="flex-row gap-2 mb-4">
        <View className="flex-1 bg-surface rounded-lg px-3 py-2 border border-border items-center">
          <Text className="text-[10px] text-label uppercase tracking-wider">Sales</Text>
          <Text className="text-sm font-bold text-green-400">{formatCurrency(sessionTotals.sales)}</Text>
        </View>
        <View className="flex-1 bg-surface rounded-lg px-3 py-2 border border-border items-center">
          <Text className="text-[10px] text-label uppercase tracking-wider">Cash In</Text>
          <Text className="text-sm font-bold text-green-400">{formatCurrency(sessionTotals.cashIn)}</Text>
        </View>
        <View className="flex-1 bg-surface rounded-lg px-3 py-2 border border-border items-center">
          <Text className="text-[10px] text-label uppercase tracking-wider">Cash Out</Text>
          <Text className="text-sm font-bold text-red-400">{formatCurrency(sessionTotals.cashOut)}</Text>
        </View>
        <View className="flex-1 bg-surface rounded-lg px-3 py-2 border border-border items-center">
          <Text className="text-[10px] text-label uppercase tracking-wider">Ops</Text>
          <Text className="text-sm font-bold text-white">{operations.length}</Text>
        </View>
      </View>

      {/* Operation Buttons */}
      <View className="flex-row gap-2 mb-4">
        <TouchableOpacity
          onPress={() => openPayInOut("pay_in")}
          className="flex-1 py-3.5 rounded-xl bg-green-900/60 border border-green-700 items-center"
        >
          <ArrowDownCircle size={20} color="#4ade80" />
          <Text className="text-xs font-semibold text-green-400 mt-1">Pay In</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => openPayInOut("pay_out")}
          className="flex-1 py-3.5 rounded-xl bg-red-900/60 border border-red-700 items-center"
        >
          <ArrowUpCircle size={20} color="#f87171" />
          <Text className="text-xs font-semibold text-red-400 mt-1">Pay Out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => openPayInOut("cash_drop")}
          className="flex-1 py-3.5 rounded-xl bg-blue-900/60 border border-blue-700 items-center"
        >
          <Inbox size={20} color="#60a5fa" />
          <Text className="text-xs font-semibold text-blue-400 mt-1">Cash Drop</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setNoSaleOpen(true)}
          className="flex-1 py-3.5 rounded-xl bg-gray-800 border border-gray-600 items-center"
        >
          <Banknote size={20} color="#d1d5db" />
          <Text className="text-xs font-semibold text-gray-300 mt-1">No Sale</Text>
        </TouchableOpacity>
      </View>

      {/* Operations list */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-semibold text-white">Transactions</Text>
        <Text className="text-xs text-label">{operations.length} total</Text>
      </View>

      {recentOps.length === 0 ? (
        <View className="py-8 items-center">
          <Receipt size={28} color={colors.muted} />
          <Text className="text-sm text-label italic mt-2">No transactions yet</Text>
        </View>
      ) : (
        recentOps.map((op) => {
          const isDebit = isDebitOperation(op.operationType);
          const isNoEffect = isNoEffectOperation(op.operationType);
          const opStyle = OP_COLORS[op.operationType] ?? { bg: "bg-surface", text: "text-gray-400" };

          return (
            <View
              key={op.id}
              className={`flex-row items-center px-3 py-2.5 rounded-lg mb-1.5 ${opStyle.bg}`}
            >
              {/* Left: label + meta */}
              <View className="flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text className="text-sm font-semibold text-white">
                    {OP_LABELS[op.operationType] ?? op.operationType.replace(/_/g, " ")}
                  </Text>
                  {/* Order badge */}
                  {op.orderId && (
                    <View className="flex-row items-center gap-0.5 bg-black/30 px-1.5 py-0.5 rounded">
                      <ExternalLink size={9} color={colors.muted} />
                      <Text className="text-[10px] text-gray-400">Order</Text>
                    </View>
                  )}
                </View>
                <View className="flex-row items-center gap-2 mt-0.5">
                  {op.reason ? (
                    <Text className="text-xs text-label">{op.reason}</Text>
                  ) : null}
                  {op.performedAt ? (
                    <Text className="text-[10px] text-gray-600">{formatTime(op.performedAt)}</Text>
                  ) : null}
                </View>
              </View>

              {/* Right: amount */}
              <Text className={`text-base font-bold ${isNoEffect ? "text-gray-500" : opStyle.text}`}>
                {isNoEffect
                  ? "—"
                  : `${isDebit ? "-" : "+"}${formatCurrency(op.amount)}`}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );

  // ── Close view ─────────────────────────────────────────────────────────────
  const renderCloseView = () => (
    <View>
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-xl font-bold text-white">Close Drawer</Text>
          <Text className="text-sm text-label mt-0.5">Count the cash to end your session</Text>
        </View>
        <TouchableOpacity
          onPress={() => setView("active")}
          className="px-3 py-1.5 rounded-lg bg-surface border border-border"
        >
          <Text className="text-sm text-label">Back</Text>
        </TouchableOpacity>
      </View>

      <DenominationCounter
        onTotalChange={(total, details) => {
          setClosingTotal(total);
          setClosingDetails(details);
        }}
      />

      {/* Variance Display */}
      <View className="bg-surface border border-border rounded-xl p-4 mt-4">
        {!isBlind && (
          <View className="flex-row justify-between mb-2">
            <Text className="text-base text-label">Expected</Text>
            <Text className="text-base font-semibold text-white">
              {formatCurrency(runningBalance)}
            </Text>
          </View>
        )}
        <View className="flex-row justify-between mb-2">
          <Text className="text-base text-label">Counted</Text>
          <Text className="text-base font-semibold text-white">
            {formatCurrency(closingTotal)}
          </Text>
        </View>
        {!isBlind && (
          <View className="border-t border-border pt-2">
            <View className="flex-row justify-between">
              <Text className="text-base font-bold text-white">Variance</Text>
              <Text className={`text-lg font-bold ${getVarianceColor(variance)}`}>
                {variance >= 0 ? "+" : ""}{formatCurrency(variance)}
              </Text>
            </View>
          </View>
        )}
      </View>

      <View className="mt-3">
        <Text className="text-sm text-label mb-1">Notes (optional)</Text>
        <TextInput
          value={varianceNotes}
          onChangeText={setVarianceNotes}
          placeholder="Add variance notes..."
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={2}
          className="h-16 px-3 py-2 bg-surface border border-border rounded-lg text-white text-sm"
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity
        onPress={handleClose}
        disabled={isSubmitting}
        className={`mt-4 py-4 rounded-xl items-center flex-row justify-center gap-2 ${
          isSubmitting ? "bg-gray-600" : "bg-red-700"
        }`}
      >
        <Lock size={18} color="white" />
        <Text className="text-lg font-bold text-white">
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
        <Text className="text-xl font-bold text-white mb-4 text-center">
          Drawer Closed
        </Text>
        <View className="bg-surface border border-border rounded-xl p-4">
          <View className="flex-row justify-between mb-2">
            <Text className="text-base text-label">Expected</Text>
            <Text className="text-base font-semibold text-white">
              {formatCurrency(closeSummary.expected)}
            </Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-base text-label">Actual Count</Text>
            <Text className="text-base font-semibold text-white">
              {formatCurrency(closeSummary.actual)}
            </Text>
          </View>
          <View className="border-t border-border pt-2">
            <View className="flex-row justify-between">
              <Text className="text-base font-bold text-white">Variance</Text>
              <Text className={`text-lg font-bold ${getVarianceColor(v)}`}>
                {v >= 0 ? "+" : ""}{formatCurrency(v)}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={onClose}
          className="mt-6 py-4 rounded-xl items-center bg-teal"
        >
          <Text className="text-lg font-bold text-black">Done</Text>
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
        <BottomSheetScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
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
