import { useCFD } from "@/contexts/CFDProvider";
import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import { useActiveOrder, useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { PrinterService } from "@/services/printing/PrinterService";
import { ArrowLeft, Banknote, Delete, DollarSign } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ScrollView,
    Text,
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

      // Fire-and-forget: auto-open cash drawer after successful payment
      PrinterService.openCashDrawer().catch((err) => {
        console.warn("[CashPayment] Cash drawer auto-open failed:", err);
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
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ alignItems: "center", paddingVertical: 20 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: `${colors.success}18`, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
            <Banknote size={28} color={colors.success} />
          </View>
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.heading }}>Cash Payment</Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>
            {activeSplit ? `Payment for ${activeSplit.customerName}` : "Enter amount received"}
          </Text>
        </View>

        {/* Main Card */}
        <View style={{ marginHorizontal: 16, backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
          {/* Top Section: Amount Due */}
          <View style={{ padding: 20, alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
              Total Due
            </Text>
            <Text style={{ fontSize: 36, fontWeight: "700", color: colors.teal }}>
              ${displayTotal.toFixed(2)}
            </Text>
          </View>

          {/* Middle Section: Input + Numpad */}
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: "row", gap: 4 }}>
              {/* Left: label + display + suggestions */}
              <View style={{ flex: 3, justifyContent: "flex-start" }}>
                <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>Amount Received</Text>
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, height: 52, marginBottom: 12 }}>
                  <DollarSign size={16} color={colors.muted} />
                  <Text style={{ flex: 1, fontSize: 24, fontWeight: "700", color: colors.heading, marginLeft: 8 }}>
                    {amountTendered || "0.00"}
                  </Text>
                  {amountTendered.length > 0 && (
                    <TouchableOpacity onPress={() => setAmountTendered("")}>
                      <Delete size={18} color={colors.muted} />
                    </TouchableOpacity>
                  )}
                </View>
                {/* Quick Suggestions */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  <TouchableOpacity
                    onPress={handleSelectExact}
                    style={{ flexGrow: 1, backgroundColor: `${colors.teal}15`, borderWidth: 1, borderColor: `${colors.teal}50`, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 }}
                  >
                    <Text style={{ color: colors.teal, fontWeight: "700", textAlign: "center", fontSize: 13 }}>Exact</Text>
                  </TouchableOpacity>
                  {suggestions.map((bill) => (
                    <TouchableOpacity
                      key={bill}
                      onPress={() => handleSelectAmount(bill)}
                      style={{ flexGrow: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 }}
                    >
                      <Text style={{ color: colors.heading, fontWeight: "700", textAlign: "center", fontSize: 13 }}>${bill}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Right: Numpad */}
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 6 }}>
                {[["1","2","3"],["4","5","6"],["7","8","9"],[".", "0", "⌫"]].map((row, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: 6 }}>
                    {row.map((btn) => (
                      <TouchableOpacity
                        key={btn}
                        onPress={() => {
                          if (btn === "⌫") {
                            setAmountTendered((prev) => prev.length <= 1 ? "" : prev.slice(0, -1));
                          } else if (btn === ".") {
                            if (!amountTendered.includes(".")) setAmountTendered((prev) => (prev || "0") + ".");
                          } else {
                            setAmountTendered((prev) => {
                              if (!prev && btn === "0") return "0";
                              const [, dec = ""] = prev.split(".");
                              if (prev.includes(".") && dec.length >= 2) return prev;
                              return prev + btn;
                            });
                          }
                        }}
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: 10,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: colors.panel,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        {btn === "⌫"
                          ? <Delete size={16} color={colors.muted} />
                          : <Text style={{ color: colors.heading, fontSize: 18, fontWeight: "600" }}>{btn}</Text>
                        }
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
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
          <View style={{ padding: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: isSufficient ? `${colors.success}10` : "transparent" }}>
            <Text style={{ fontSize: 15, fontWeight: "500", color: colors.muted }}>Change Due</Text>
            <Text style={{ fontSize: 28, fontWeight: "700", color: isSufficient ? colors.success : colors.muted }}>
              ${displayChangeDue > 0 ? displayChangeDue.toFixed(2) : "0.00"}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer Buttons */}
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: colors.screen, paddingTop: 12, paddingBottom: 32, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <TouchableOpacity
            onPress={handleBack}
            disabled={isProcessing}
            style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, opacity: isProcessing ? 0.5 : 1 }}
          >
            <ArrowLeft size={18} color={colors.muted} />
            <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 15 }}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleProcessCashPayment}
            disabled={(!isSufficient && total > 0) || isProcessing}
            style={{ flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: (isSufficient || total === 0) && !isProcessing ? colors.teal : colors.panel, borderWidth: (isSufficient || total === 0) && !isProcessing ? 0 : 1, borderColor: colors.border }}
          >
            <Text style={{ fontWeight: "700", fontSize: 16, color: (isSufficient || total === 0) && !isProcessing ? "#000" : colors.muted }}>
              {isProcessing ? "Processing..." : total === 0 ? "Complete Order" : "Finalize Payment"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default CashPaymentView;
