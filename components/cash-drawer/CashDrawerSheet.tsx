/**
 * CashDrawerSheet
 *
 * Full cash drawer lifecycle: Open -> Active (view operations) -> Close with variance display.
 * Presented as a bottom sheet modal.
 */

import DenominationCounter from "@/components/cash-drawer/DenominationCounter";
import { colors, bottomSheetTheme } from "@/lib/theme";
import { formatCurrency } from "@/utils/currency";
import {
  closeDrawerSession,
  openDrawerSession,
  recordDrawerOperation,
} from "@/services/cashDrawerService";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  DenominationCount,
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
  DollarSign,
  Lock,
  Unlock,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Text, TextInput, TouchableOpacity, View } from "react-native";

interface CashDrawerSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

type DrawerView = "open" | "active" | "close";

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

  const [view, setView] = useState<DrawerView>(
    activeSession?.status === "open" ? "active" : "open"
  );
  const [openingTotal, setOpeningTotal] = useState(0);
  const [openingDetails, setOpeningDetails] = useState<DenominationCount[]>([]);
  const [closingTotal, setClosingTotal] = useState(0);
  const [closingDetails, setClosingDetails] = useState<DenominationCount[]>([]);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickReason, setQuickReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      bottomSheetRef.current?.present();
      setView(activeSession?.status === "open" ? "active" : "open");
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [isOpen, activeSession?.status]);

  const handleOpen = useCallback(async () => {
    if (!drawerId || !selectedStore || !loggedInEmployee) return;
    setIsSubmitting(true);

    const result = await openDrawerSession(supabase, {
      cashDrawerId: drawerId,
      merchantId: selectedStore.merchant_id,
      locationId: selectedStore.id,
      openedBy: loggedInEmployee.profileId,
      openingAmount: openingTotal,
      openingCountDetails: openingDetails,
    });

    setIsSubmitting(false);
    if (result.success) {
      setView("active");
    }
  }, [drawerId, selectedStore, loggedInEmployee, openingTotal, openingDetails, supabase]);

  const handleClose = useCallback(async () => {
    if (!activeSession || !drawerId || !loggedInEmployee) return;
    setIsSubmitting(true);

    const result = await closeDrawerSession(supabase, {
      sessionId: activeSession.id,
      cashDrawerId: drawerId,
      closedBy: loggedInEmployee.profileId,
      closingAmount: closingTotal,
      closingCountDetails: closingDetails,
    });

    setIsSubmitting(false);
    if (result.success) {
      onClose();
    }
  }, [activeSession, drawerId, loggedInEmployee, closingTotal, closingDetails, supabase, onClose]);

  const handleQuickOperation = useCallback(
    async (type: "deposit" | "withdrawal") => {
      const amount = parseFloat(quickAmount);
      if (isNaN(amount) || amount <= 0 || !activeSession || !drawerId || !loggedInEmployee) return;

      await recordDrawerOperation(supabase, {
        cashDrawerId: drawerId,
        sessionId: activeSession.id,
        operationType: type,
        amount,
        performedBy: loggedInEmployee.profileId,
        reason: quickReason || undefined,
      });

      setQuickAmount("");
      setQuickReason("");
    },
    [quickAmount, quickReason, activeSession, drawerId, loggedInEmployee, supabase]
  );

  const runningBalance = useMemo(() => getRunningBalance(), [operations, activeSession]);
  const variance = useMemo(() => getVariance(closingTotal), [closingTotal, operations, activeSession]);

  const recentOps = useMemo(() => {
    return [...operations].reverse().slice(0, 20);
  }, [operations]);

  const renderOpenView = () => (
    <View>
      <Text className="text-xl font-bold text-white mb-2">Open Cash Drawer</Text>
      <Text className="text-sm text-label mb-4">
        Count the cash in the drawer to start your session.
      </Text>

      <DenominationCounter
        onTotalChange={(total, details) => {
          setOpeningTotal(total);
          setOpeningDetails(details);
        }}
      />

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
            {isSubmitting ? "Opening..." : `Open Drawer (${formatCurrency(openingTotal)})`}
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

      {/* Quick Deposit/Withdrawal */}
      <View className="bg-surface border border-border rounded-xl p-4 mb-4">
        <Text className="text-base font-semibold text-white mb-3">
          Quick Operation
        </Text>
        <View className="flex-row gap-3 mb-3">
          <TextInput
            value={quickAmount}
            onChangeText={setQuickAmount}
            placeholder="Amount"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            className="flex-1 h-12 px-3 bg-panel border border-border rounded-lg text-white text-base"
          />
          <TextInput
            value={quickReason}
            onChangeText={setQuickReason}
            placeholder="Reason (optional)"
            placeholderTextColor={colors.muted}
            className="flex-1 h-12 px-3 bg-panel border border-border rounded-lg text-white text-base"
          />
        </View>
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={() => handleQuickOperation("deposit")}
            className="flex-1 py-3 rounded-lg bg-green-800 items-center flex-row justify-center gap-2"
          >
            <ArrowDownCircle size={18} color="#4ade80" />
            <Text className="text-base font-semibold text-green-400">
              Deposit
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleQuickOperation("withdrawal")}
            className="flex-1 py-3 rounded-lg bg-red-900 items-center flex-row justify-center gap-2"
          >
            <ArrowUpCircle size={18} color="#f87171" />
            <Text className="text-base font-semibold text-red-400">
              Withdraw
            </Text>
          </TouchableOpacity>
        </View>
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
          const isDebit = ["withdrawal", "change_given", "refund", "cash_out"].includes(
            op.operationType
          );
          return (
            <View
              key={op.id}
              className="flex-row items-center py-2 border-b border-border"
            >
              <DollarSign
                size={16}
                color={isDebit ? colors.danger : colors.success}
              />
              <View className="flex-1 ml-2">
                <Text className="text-sm text-white capitalize">
                  {op.operationType.replace(/_/g, " ")}
                </Text>
                {op.reason && (
                  <Text className="text-xs text-label">{op.reason}</Text>
                )}
              </View>
              <Text
                className={`text-base font-semibold ${
                  isDebit ? "text-red-400" : "text-green-400"
                }`}
              >
                {isDebit ? "-" : "+"}
                {formatCurrency(op.amount)}
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
        <View className="flex-row justify-between mb-2">
          <Text className="text-base text-label">Expected</Text>
          <Text className="text-base font-semibold text-white">
            {formatCurrency(runningBalance)}
          </Text>
        </View>
        <View className="flex-row justify-between mb-2">
          <Text className="text-base text-label">Counted</Text>
          <Text className="text-base font-semibold text-white">
            {formatCurrency(closingTotal)}
          </Text>
        </View>
        <View className="border-t border-border pt-2">
          <View className="flex-row justify-between">
            <Text className="text-base font-bold text-white">Variance</Text>
            <Text
              className={`text-lg font-bold ${
                variance === 0
                  ? "text-green-400"
                  : variance > 0
                  ? "text-blue-400"
                  : "text-red-400"
              }`}
            >
              {variance >= 0 ? "+" : ""}
              {formatCurrency(variance)}
            </Text>
          </View>
        </View>
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

  return (
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
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
};

export default CashDrawerSheet;
