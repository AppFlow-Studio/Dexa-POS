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
  DollarSign,
  Inbox,
  Lock,
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

  // Modal states
  const [payInOutMode, setPayInOutMode] = useState<"pay_in" | "pay_out" | "cash_drop">("pay_in");
  const [isPayInOutOpen, setPayInOutOpen] = useState(false);
  const [isNoSaleOpen, setNoSaleOpen] = useState(false);

  // Close summary data (shown after close completes when blind count)
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
        // Show summary after close when blind counting
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

  const recentOps = useMemo(() => {
    return [...operations].reverse().slice(0, 20);
  }, [operations]);

  const isBlind = cashDrawerSettings.blindCloseCount;
  const { varianceWarningThreshold, varianceAlertThreshold } = cashDrawerSettings;

  const getVarianceColor = (v: number) => {
    const abs = Math.abs(v);
    if (abs === 0) return "text-green-400";
    if (abs >= varianceAlertThreshold) return "text-red-400";
    if (abs >= varianceWarningThreshold) return "text-yellow-400";
    return "text-blue-400";
  };

  const renderOpenView = () => (
    <View>
      <Text className="text-xl font-bold text-white mb-2">Open Cash Drawer</Text>
      <Text className="text-sm text-label mb-4">
        Count the cash in the drawer to start your session.
      </Text>

      {/* Quick Start Toggle */}
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
        className={`mt-4 py-4 rounded-xl items-center ${
          isSubmitting ? "bg-gray-600" : "bg-teal"
        }`}
      >
        <View className="flex-row items-center gap-2">
          <Unlock size={20} color="black" />
          <Text className="text-lg font-bold text-black">
            {isSubmitting
              ? "Opening..."
              : `Open Drawer (${formatCurrency(
                  isQuickStart ? parseFloat(quickStartAmount) || 0 : openingTotal
                )})`}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderActiveView = () => (
    <View>
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-xl font-bold text-white">
            {drawerName || "Cash Drawer"}
          </Text>
          <Text className="text-sm text-label">Session Active</Text>
        </View>
        <View className="items-end">
          <Text className="text-sm text-label">Balance</Text>
          <Text className="text-2xl font-bold text-teal">
            {formatCurrency(runningBalance)}
          </Text>
        </View>
      </View>

      {/* Operation Buttons */}
      <View className="flex-row flex-wrap gap-3 mb-4">
        <TouchableOpacity
          onPress={() => openPayInOut("pay_in")}
          className="flex-1 min-w-[120px] py-4 rounded-xl bg-green-900 border border-green-700 items-center"
        >
          <ArrowDownCircle size={22} color="#4ade80" />
          <Text className="text-sm font-semibold text-green-400 mt-1">Pay In</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => openPayInOut("pay_out")}
          className="flex-1 min-w-[120px] py-4 rounded-xl bg-red-900 border border-red-700 items-center"
        >
          <ArrowUpCircle size={22} color="#f87171" />
          <Text className="text-sm font-semibold text-red-400 mt-1">Pay Out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => openPayInOut("cash_drop")}
          className="flex-1 min-w-[120px] py-4 rounded-xl bg-blue-900 border border-blue-700 items-center"
        >
          <Inbox size={22} color="#60a5fa" />
          <Text className="text-sm font-semibold text-blue-400 mt-1">Cash Drop</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setNoSaleOpen(true)}
          className="flex-1 min-w-[120px] py-4 rounded-xl bg-gray-700 border border-gray-600 items-center"
        >
          <Banknote size={22} color="#d1d5db" />
          <Text className="text-sm font-semibold text-gray-300 mt-1">No Sale</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Operations */}
      <Text className="text-base font-semibold text-white mb-2">
        Recent Operations
      </Text>
      {recentOps.length === 0 ? (
        <Text className="text-sm text-label italic py-3">
          No operations yet
        </Text>
      ) : (
        recentOps.map((op) => {
          const isDebit = isDebitOperation(op.operationType);
          const isNoEffect = isNoEffectOperation(op.operationType);
          return (
            <View
              key={op.id}
              className="flex-row items-center py-2 border-b border-border"
            >
              <DollarSign
                size={16}
                color={isNoEffect ? colors.muted : isDebit ? colors.danger : colors.success}
              />
              <View className="flex-1 ml-2">
                <Text className="text-sm text-white">
                  {OP_LABELS[op.operationType] || op.operationType.replace(/_/g, " ")}
                </Text>
                {op.reason && (
                  <Text className="text-xs text-label">{op.reason}</Text>
                )}
              </View>
              <Text
                className={`text-base font-semibold ${
                  isNoEffect
                    ? "text-gray-400"
                    : isDebit
                    ? "text-red-400"
                    : "text-green-400"
                }`}
              >
                {isNoEffect ? "" : isDebit ? "-" : "+"}
                {isNoEffect ? "—" : formatCurrency(op.amount)}
              </Text>
            </View>
          );
        })
      )}

      {/* Close Drawer Button */}
      <TouchableOpacity
        onPress={() => setView("close")}
        className="mt-4 py-4 rounded-xl items-center bg-red-900 border border-red-700"
      >
        <View className="flex-row items-center gap-2">
          <Lock size={20} color="#f87171" />
          <Text className="text-lg font-bold text-red-400">Close Drawer</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderCloseView = () => (
    <View>
      <Text className="text-xl font-bold text-white mb-2">Close Cash Drawer</Text>
      <Text className="text-sm text-label mb-4">
        Count the cash in the drawer to close your session.
      </Text>

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
                {variance >= 0 ? "+" : ""}
                {formatCurrency(variance)}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Variance Notes */}
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

      <View className="flex-row gap-3 mt-4">
        <TouchableOpacity
          onPress={() => setView("active")}
          className="flex-1 py-4 rounded-xl items-center bg-gray-700"
        >
          <Text className="text-lg font-bold text-white">Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleClose}
          disabled={isSubmitting}
          className={`flex-1 py-4 rounded-xl items-center ${
            isSubmitting ? "bg-gray-600" : "bg-red-700"
          }`}
        >
          <Text className="text-lg font-bold text-white">
            {isSubmitting ? "Closing..." : "Confirm Close"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

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
                {v >= 0 ? "+" : ""}
                {formatCurrency(v)}
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
        snapPoints={["70%", "90%"]}
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
        <BottomSheetScrollView contentContainerStyle={{ padding: 16 }}>
          {view === "open" && renderOpenView()}
          {view === "active" && renderActiveView()}
          {view === "close" && renderCloseView()}
          {view === "close_summary" && renderCloseSummary()}
        </BottomSheetScrollView>
      </BottomSheetModal>

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
