import { useCFD } from "@/contexts/CFDProvider";
import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import { useActiveOrder, useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { ArrowLeft, Banknote, Delete, DollarSign } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
const CashPaymentView = () => {
  // Refresh order data on mount and realtime reconnection
  // useRefreshActiveOrder(); -> REMOVED to prevent overwriting local discount state with stale backend data

  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const orderTotals = useActiveOrderTotals();
  // console.log("activeOrderOutstandingCash", activeOrderOutstandingCash);
  const close = usePaymentStore((s) => s.close);
  const setView = usePaymentStore((s) => s.setView);
  const activeSplitId = usePaymentStore((s) => s.activeSplitId);
  const splits = usePaymentStore((s) => s.splits);
  const handlePaymentCompletion = usePaymentStore((s) => s.handlePaymentCompletion);
  const expandSheetToFull = usePaymentStore((s) => s.expandSheetToFull);
  const setTransactionProcessing = usePaymentStore((s) => s.setTransactionProcessing);

  // Expand bottom sheet to full height when entering cash payment view
  useEffect(() => {
    expandSheetToFull();
  }, [expandSheetToFull]);

  const [amountTendered, setAmountTendered] = useState("");
  const [tipInput, setTipInput] = useState("");
  const [selectedTipPreset, setSelectedTipPreset] = useState<number | null>(
    null,
  );
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync isTransactionProcessing with isProcessing
  useEffect(() => {
    setTransactionProcessing(isProcessing);
    return () => { setTransactionProcessing(false); };
  }, [isProcessing, setTransactionProcessing]);

  const {
    showTipSelection,
    updateTip,
    setScreenState,
    setBaseAmount,
    tipResponse,
    clearTipResponse,
    showProcessing,
    showApproved,
    showDeclined,
  } = useCFD();

  const tipPresetPercentages = useStoreSettingsStore((s) => s.tipPresetPercentages);
  const TIP_PRESETS = tipPresetPercentages;

  // Get the active order for backend cash_amount_due
  const activeOrder = useActiveOrder();

  // --- LOGIC: DETERMINE AMOUNT TO PAY (CASH PRICING) ---
  const activeSplit = splits.find((s) => s.id === activeSplitId);
  // For cash payments, use cash outstanding total (unpaid items at cash prices)
  // Priority: derived selector cash outstanding > backend cash_amount_due > full cash total
  const activeOrderOutstandingCash = orderTotals?.cashAmountDue ?? 0;
  const activeOrderTotalCash = orderTotals?.cashTotal ?? 0;
  const effectiveOutstandingCash =
    activeOrderOutstandingCash > 0
      ? activeOrderOutstandingCash
      : activeOrder?.cash_amount_due !== undefined &&
          activeOrder.cash_amount_due >= 0.01
        ? activeOrder.cash_amount_due
        : activeOrderTotalCash;
  // console.log("effectiveOutstandingCash", effectiveOutstandingCash);

  // For split payments, prefer cashAmount (cash pricing) over amount (card pricing)
  // This ensures cash payments use the correct discounted cash price
  const total = activeSplit
    ? (activeSplit.cashAmount ?? activeSplit.amount)
    : effectiveOutstandingCash;
  // console.log("total", total);

  const tipAmount = parseFloat(tipInput) || 0;
  const grandTotal = total + tipAmount; // Total including tip
  const tendered = parseFloat(amountTendered) || 0;
  const changeDue = tendered - grandTotal; // Change is after tip
  const isSufficient = tendered >= grandTotal;

  // Freeze displayed values once processing starts to prevent flicker
  const frozenTotal = useRef(total);
  const frozenChangeDue = useRef(changeDue);
  useEffect(() => {
    if (isProcessing) {
      frozenTotal.current = total;
      frozenChangeDue.current = changeDue;
    }
  }, [isProcessing]); // Intentionally only depend on isProcessing — capture at transition
  const displayTotal = isProcessing ? frozenTotal.current : total;
  const displayChangeDue = isProcessing ? frozenChangeDue.current : changeDue;

  // Generate smart bill suggestions based on grand total
  const suggestions = useMemo(() => {
    const bills = [10, 20, 50, 100];
    return bills.filter(
      (bill) => bill >= grandTotal || bill === 100 || bill === 50,
    );
  }, [grandTotal]);

  const handleSelectAmount = (amount: number) => {
    setAmountTendered(amount.toString());
  };

  const handleSelectExact = () => {
    setAmountTendered(total.toFixed(2));
  };

  const handleTipPreset = (percentage: number) => {
    const calculatedTip = (percentage / 100) * total;
    setTipInput(calculatedTip.toFixed(2));
    setSelectedTipPreset(percentage);
    updateTip(calculatedTip, percentage);
  };

  const handleTipInputChange = (value: string) => {
    // Only allow valid currency format (numbers and one decimal point)
    if (/^\d*\.?\d{0,2}$/.test(value) || value === "") {
      setTipInput(value);
      setSelectedTipPreset(null); // Clear preset when manually typing
      updateTip(parseFloat(value) || 0, null);
    }
  };

  // Sync CFD on mount
  useEffect(() => {
    // Show tip selection on CFD when Cash View opens with the local cash-priced total
    showTipSelection(total, TIP_PRESETS);
    clearTipResponse();

    // Cleanup: Reset CFD state when leaving the cash payment view
    return () => {
      setScreenState(null);
      setBaseAmount(null);
    };
  }, []); // Only run once on mount

  // Handle CFD Tip Response
  useEffect(() => {
    if (tipResponse) {
      const tipDollars = (tipResponse.tipAmount / 100).toFixed(2);
      setTipInput(tipDollars);

      if (tipResponse.tipPercentage) {
        setSelectedTipPreset(tipResponse.tipPercentage);
      } else {
        setSelectedTipPreset(null);
      }
    }
  }, [tipResponse]);

  const handleProcessCashPayment = async () => {
    setIsProcessing(true);
    showProcessing();
    try {
      const tipAmt = parseFloat(tipInput) || 0;
      const amountTenderedNum = parseFloat(amountTendered) || 0;

      showApproved();
      await handlePaymentCompletion({
        method: "Cash",
        tipAmount: tipAmt,
        transactionDetails: {
          amountTendered: amountTenderedNum,
          isCashPriced: true,
        },
      });
    } catch (error) {
      console.error("[CashPayment] Error processing payment:", error);
      showDeclined();
      toastService.show({
        title: "Payment Failed",
        message: error instanceof Error ? error.message : "Unknown error",
        type: "error",
        duration: 5000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBack = () => {
    setView("payment-method-selection");
  };

  return (
    <View className="flex-1 bg-panel">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="items-center py-6 pt-2">
          <View className="w-16 h-16 bg-green-900/20 rounded-full items-center justify-center mb-3">
            <Banknote size={32} color={colors.success} />
          </View>
          <Text className="text-2xl font-bold text-white">Cash Payment</Text>
          <Text className="text-gray-400">
            {activeSplit
              ? `Payment for ${activeSplit.customerName}`
              : "Enter amount received"}
          </Text>
        </View>

        {/* Main Card */}
        <View className="mx-4 bg-surface rounded-2xl border border-border overflow-hidden">
          {/* Top Section: Amount Due */}
          <View className="p-6 items-center border-b border-border">
            <Text className="text-gray-400 uppercase tracking-widest text-xs font-bold mb-2">
              Total Due
            </Text>
            <Text className="text-4xl font-bold text-white">
              ${displayTotal.toFixed(2)}
            </Text>
          </View>

          {/* Middle Section: Input */}
          <View className="p-4 bg-surface">
            <Text className="text-gray-400 mb-2 font-medium">
              Amount Received
            </Text>
            <View className="flex-row items-center bg-panel border border-border rounded-xl px-4 h-16">
              <DollarSign size={20} color={colors.label} />
              <TextInput
                value={amountTendered}
                onChangeText={setAmountTendered}
                placeholder="0.00"
                keyboardType="numeric"
                className="flex-1 text-2xl font-bold text-white ml-2 h-full"
                placeholderTextColor={colors.muted}
                autoFocus={false}
              />
              {amountTendered.length > 0 && (
                <TouchableOpacity onPress={() => setAmountTendered("")}>
                  <Delete size={20} color={colors.muted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Suggestions Grid */}
            <View className="flex-row flex-wrap gap-2 mt-4">
              <TouchableOpacity
                onPress={handleSelectExact}
                className="flex-grow bg-surface border border-border py-3 px-4 rounded-lg active:bg-surface"
              >
                <Text className="text-blue-400 font-bold text-center">
                  Exact
                </Text>
              </TouchableOpacity>

              {suggestions.map((bill) => (
                <TouchableOpacity
                  key={bill}
                  onPress={() => handleSelectAmount(bill)}
                  className="flex-grow bg-surface border border-border py-3 px-4 rounded-lg active:bg-surface"
                >
                  <Text className="text-white font-bold text-center">
                    ${bill}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Grand Total Section - Shows when tip is added */}
          {/* <View className="p-4 bg-panel border-t border-border">
            <View className="flex-row justify-between items-center">
              <Text className="text-gray-400 text-sm">Bill Total</Text>
              <Text className="text-gray-400 text-sm">${total.toFixed(2)}</Text>
            </View>
            {tipAmount > 0 && (
              <View className="flex-row justify-between items-center mt-1">
                <Text className="text-green-400 text-sm">+ Tip</Text>
                <Text className="text-green-400 text-sm">
                  ${tipAmount.toFixed(2)}
                </Text>
              </View>
            )}
            <View className="flex-row justify-between items-center mt-2 pt-2 border-t border-border">
              <Text className="text-white font-bold text-lg">Grand Total</Text>
              <Text className="text-blue-400 font-bold text-2xl">
                ${grandTotal.toFixed(2)}
              </Text>
            </View>
          </View> */}

          {/* Bottom Section: Change Calculation */}
          <View
            className={`p-6 flex-row justify-between items-center ${
              isSufficient ? "bg-green-900/10" : "bg-surface"
            }`}
          >
            <Text className="text-lg font-medium text-gray-300">
              Change Due
            </Text>
            <Text
              className={`text-3xl font-bold ${
                isSufficient ? "text-green-400" : "text-gray-500"
              }`}
            >
              ${displayChangeDue > 0 ? displayChangeDue.toFixed(2) : "0.00"}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer Buttons */}
      <View className="absolute bottom-0 left-0 right-0 bg-panel pt-2 pb-10 border-t border-border">
        <View className="flex-row gap-4 px-4">
          <TouchableOpacity
            onPress={handleBack}
            disabled={isProcessing}
            className={`flex-1 py-4 bg-surface rounded-xl border border-border flex-row items-center justify-center active:bg-surface ${isProcessing ? "opacity-50" : ""}`}
          >
            <ArrowLeft size={20} color={colors.heading} className="mr-2" />
            <Text className="text-gray-300 font-semibold text-lg">Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleProcessCashPayment}
            disabled={(!isSufficient && total > 0) || isProcessing}
            className={`flex-[2] py-4 rounded-xl flex-row items-center justify-center shadow-sm
              ${
                (isSufficient || total === 0) && !isProcessing
                  ? "bg-blue-600 active:bg-blue-700"
                  : "bg-surface border border-border"
              }`}
          >
            <Text
              className={`font-bold text-lg ${
                (isSufficient || total === 0) && !isProcessing
                  ? "text-white"
                  : "text-gray-500"
              }`}
            >
              {isProcessing
                ? "Processing..."
                : total === 0
                  ? "Complete Order"
                  : "Finalize Payment"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default CashPaymentView;
