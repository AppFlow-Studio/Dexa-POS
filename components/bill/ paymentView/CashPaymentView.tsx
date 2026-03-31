import { useCFD } from "@/contexts/CFDProvider";
import { round2 } from "@/lib/order-calculator";
import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import { useActiveOrder, useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
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
    setBaseAmount,
    updateTip,
    showTipSelection,
    showPayment,
    showProcessing,
    showApproved,
    showDeclined,
    tipResponse,
    clearTipResponse,
  } = useCFD();

  const tipPresetPercentages = useLocationConfigStore((s) => s.config.tips.presetPercentages);
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

  const roundedTotal = round2(total);
  const tipAmount = round2(parseFloat(tipInput) || 0);
  const grandTotal = round2(roundedTotal + tipAmount); // Total including tip
  const tendered = round2(parseFloat(amountTendered) || 0);
  const changeDue = round2(tendered - grandTotal); // Change is after tip
  const isSufficient = tendered >= grandTotal;

  // Freeze displayed values once processing starts to prevent flicker
  const frozenGrandTotal = useRef(grandTotal);
  const frozenChangeDue = useRef(changeDue);
  useEffect(() => {
    if (isProcessing) {
      frozenGrandTotal.current = grandTotal;
      frozenChangeDue.current = changeDue;
    }
  }, [isProcessing]); // Intentionally only depend on isProcessing — capture at transition
  const displayGrandTotal = isProcessing ? frozenGrandTotal.current : grandTotal;
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
    setAmountTendered(grandTotal.toFixed(2));
  };

  const handleTipPreset = (percentage: number) => {
    const calculatedTip = round2((percentage / 100) * roundedTotal);
    setTipInput(calculatedTip.toFixed(2));
    setSelectedTipPreset(percentage);
  };

  const handleTipInputChange = (value: string) => {
    // Only allow valid currency format (numbers and one decimal point)
    if (/^\d*\.?\d{0,2}$/.test(value) || value === "") {
      setTipInput(value);
      setSelectedTipPreset(null); // Clear preset when manually typing
    }
  };

  // Show tip selection on CFD when cash payment opens
  useEffect(() => {
    showTipSelection(total, TIP_PRESETS);
    clearTipResponse();
    updateTip(0, null);
    return () => {
      updateTip(0, null);
      setBaseAmount(null);
    };
  }, [clearTipResponse, setBaseAmount, showTipSelection, TIP_PRESETS, total, updateTip]);

  // Sync tip selection from CFD back to POS tip input
  useEffect(() => {
    if (!tipResponse) return;
    if (tipResponse.tipAmount === 0) {
      setTipInput("");
      setSelectedTipPreset(null);
    } else {
      setTipInput((tipResponse.tipAmount / 100).toFixed(2));
      setSelectedTipPreset(tipResponse.tipPercentage);
    }
    showPayment("cash");
    clearTipResponse();
  }, [clearTipResponse, showPayment, tipResponse]);

  useEffect(() => {
    updateTip(tipAmount, selectedTipPreset);
  }, [tipAmount, selectedTipPreset, updateTip]);

  const handleProcessCashPayment = async () => {
    setIsProcessing(true);
    updateTip(tipAmount, selectedTipPreset);
    showPayment("cash");
    showProcessing("cash");
    try {
      const tipAmt = parseFloat(tipInput) || 0;
      const amountTenderedNum = parseFloat(amountTendered) || 0;

      await handlePaymentCompletion({
        method: "Cash",
        tipAmount: tipAmt,
        transactionDetails: {
          amountTendered: amountTenderedNum,
          isCashPriced: true,
        },
      });
      showApproved();

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

  const numpadHandler = (btn: string) => {
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
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen, flexDirection: "row" }}>
      {/* LEFT: Amounts summary */}
      <View style={{ width: "42%", borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: colors.panel, padding: 20, justifyContent: "center", gap: 0 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: `${colors.success}18`, alignItems: "center", justifyContent: "center" }}>
            <Banknote size={16} color={colors.success} />
          </View>
          <View>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>Cash Payment</Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>
              {activeSplit ? `For ${activeSplit.customerName}` : "Enter amount received"}
            </Text>
          </View>
        </View>

        {/* Total Due */}
        <View style={{ backgroundColor: colors.screen, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }}>
          <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Total Due</Text>
          <Text style={{ fontSize: 28, fontWeight: "700", color: colors.teal }}>${displayGrandTotal.toFixed(2)}</Text>
        </View>

        {/* Tip */}
        <View style={{ backgroundColor: tipAmount > 0 ? `${colors.teal}10` : colors.screen, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: tipAmount > 0 ? `${colors.teal}35` : colors.border, marginBottom: 10 }}>
          <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Tip</Text>
          <Text style={{ fontSize: 22, fontWeight: "700", color: tipAmount > 0 ? colors.teal : colors.muted }}>
            ${tipAmount.toFixed(2)}
          </Text>
        </View>

        {/* Amount Received */}
        <View style={{ backgroundColor: colors.screen, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }}>
          <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Amount Received</Text>
          <Text style={{ fontSize: 22, fontWeight: "700", color: colors.heading }}>${amountTendered || "0.00"}</Text>
        </View>

        {/* Change Due */}
        <View style={{ backgroundColor: isSufficient ? `${colors.success}10` : colors.screen, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: isSufficient ? `${colors.success}40` : colors.border }}>
          <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Change Due</Text>
          <Text style={{ fontSize: 22, fontWeight: "700", color: isSufficient ? colors.success : colors.muted }}>
            ${displayChangeDue > 0 ? displayChangeDue.toFixed(2) : "0.00"}
          </Text>
        </View>

        {/* Footer buttons */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
          <TouchableOpacity
            onPress={handleBack}
            disabled={isProcessing}
            style={{ flex: 1, paddingVertical: 10, backgroundColor: colors.panel, borderRadius: 8, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, opacity: isProcessing ? 0.5 : 1 }}
          >
            <ArrowLeft size={14} color={colors.muted} />
            <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 12 }}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleProcessCashPayment}
            disabled={(!isSufficient && total > 0) || isProcessing}
            style={{ flex: 2, paddingVertical: 10, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: (isSufficient || total === 0) && !isProcessing ? colors.teal : colors.screen, borderWidth: (isSufficient || total === 0) && !isProcessing ? 0 : 1, borderColor: colors.border }}
          >
            <Text style={{ fontWeight: "700", fontSize: 12, color: (isSufficient || total === 0) && !isProcessing ? "#000" : colors.muted }}>
              {isProcessing ? "Processing..." : total === 0 ? "Complete Order" : "Finalize Payment"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* RIGHT: Input + suggestions + numpad */}
      <View style={{ flex: 1, backgroundColor: colors.screen, padding: 16, justifyContent: "center" }}>
        {/* Display */}
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, height: 42, marginBottom: 10 }}>
          <DollarSign size={14} color={colors.muted} />
          <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: colors.heading, marginLeft: 6 }}>
            {amountTendered || "0.00"}
          </Text>
          {amountTendered.length > 0 && (
            <TouchableOpacity onPress={() => setAmountTendered("")}>
              <Delete size={14} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Quick suggestions */}
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
          <TouchableOpacity
            onPress={handleSelectExact}
            style={{ flex: 1, backgroundColor: `${colors.teal}15`, borderWidth: 1, borderColor: `${colors.teal}40`, paddingVertical: 6, borderRadius: 7, alignItems: "center" }}
          >
            <Text style={{ color: colors.teal, fontWeight: "700", fontSize: 12 }}>Exact</Text>
          </TouchableOpacity>
          {suggestions.map((bill) => (
            <TouchableOpacity
              key={bill}
              onPress={() => handleSelectAmount(bill)}
              style={{ flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, paddingVertical: 6, borderRadius: 7, alignItems: "center" }}
            >
              <Text style={{ color: colors.heading, fontWeight: "700", fontSize: 12 }}>${bill}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Numpad */}
        <View style={{ alignItems: "center", gap: 6 }}>
          {[["1","2","3"],["4","5","6"],["7","8","9"],[".", "0", "⌫"]].map((row, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 6 }}>
              {row.map((btn) => (
                <TouchableOpacity
                  key={btn}
                  onPress={() => numpadHandler(btn)}
                  style={{ width: 82, height: 50, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}
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
  );
};

export default CashPaymentView;
