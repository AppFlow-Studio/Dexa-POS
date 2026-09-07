import { useCFD } from "@/contexts/CFDProvider";
import {
  classifyKickOutcome,
  describeCashDrawerKickError,
  DRAWER_UNCONFIRMED_MESSAGE,
} from "@/lib/cashDrawerKick";
import { computeChangeBreakdown } from "@/lib/cashChange";
import { round2 } from "@/lib/order-calculator";
import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import { useUiScale } from "@/lib/uiScale";
import { PrinterService } from "@/services/printing/PrinterService";
import {
    useActiveOrder,
    useActiveOrderTotals,
} from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { ArrowLeft, Delete, Printer } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const PRESET_BILLS = [10, 20, 50, 100];

const CashPaymentView = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const orderTotals = useActiveOrderTotals();
  const close = usePaymentStore((s) => s.close);
  const setView = usePaymentStore((s) => s.setView);
  const activeSplitId = usePaymentStore((s) => s.activeSplitId);
  const splits = usePaymentStore((s) => s.splits);
  const handlePaymentCompletion = usePaymentStore(
    (s) => s.handlePaymentCompletion,
  );
  const expandSheetToFull = usePaymentStore((s) => s.expandSheetToFull);
  const setTransactionProcessing = usePaymentStore(
    (s) => s.setTransactionProcessing,
  );

  useEffect(() => {
    expandSheetToFull();
  }, [expandSheetToFull]);

  const [amountTendered, setAmountTendered] = useState("");
  const [cashTip, setCashTip] = useState("");
  const [activeInput, setActiveInput] = useState<"tendered" | "tip">(
    "tendered",
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<number | "exact" | null>(
    null,
  );

  useEffect(() => {
    setTransactionProcessing(isProcessing);
    return () => setTransactionProcessing(false);
  }, [isProcessing, setTransactionProcessing]);

  const {
    setBaseAmount,
    showPayment,
    showProcessing,
    showApproved,
    showDeclined,
  } = useCFD();

  const activeOrder = useActiveOrder();

  const activeSplit = splits.find((s) => s.id === activeSplitId);
  const activeOrderOutstandingCash = orderTotals?.cashAmountDue ?? 0;
  const activeOrderTotalCash = orderTotals?.cashTotal ?? 0;
  const effectiveOutstandingCash =
    activeOrderOutstandingCash > 0
      ? activeOrderOutstandingCash
      : activeOrder?.cash_amount_due !== undefined &&
          activeOrder.cash_amount_due >= 0.01
        ? activeOrder.cash_amount_due
        : activeOrderTotalCash;

  const total = activeSplit
    ? (activeSplit.cashAmount ?? activeSplit.amount)
    : effectiveOutstandingCash;

  const grandTotal = round2(total);
  const tipAmount = round2(parseFloat(cashTip) || 0);
  const totalWithTip = round2(grandTotal + tipAmount);
  const tendered = round2(parseFloat(amountTendered) || 0);
  const changeDue = round2(tendered - totalWithTip);
  const isSufficient = tendered >= totalWithTip;

  const frozenGrandTotal = useRef(grandTotal);
  const frozenChangeDue = useRef(changeDue);

  const displayGrandTotal = isProcessing
    ? frozenGrandTotal.current
    : totalWithTip;
  const displayChangeDue = isProcessing ? frozenChangeDue.current : changeDue;

  useEffect(() => {
    showPayment("cash");
    return () => setBaseAmount(null);
  }, [setBaseAmount, showPayment, total]);

  const handleProcessCashPayment = async () => {
    // Snapshot display values before toggling processing to avoid a one-frame
    // flash of stale ref values (e.g. showing -full amount briefly).
    frozenGrandTotal.current = totalWithTip;
    frozenChangeDue.current = changeDue;
    setIsProcessing(true);
    showPayment("cash");
    showProcessing("cash", 0);
    try {
      // Fire cash drawer immediately — don't wait for payment to complete.
      // The physical action has no data dependency on payment success, so this
      // stays fire-and-forget (payment is never gated on the drawer). Only a
      // genuine "opened nowhere" surfaces a non-blocking warning — success is
      // silent (the drawer physically opening is its own confirmation).
      PrinterService.openCashDrawer({ trigger: "cash_sale" })
        .then((kick) => {
          if (!kick.ok) {
            toastService.show({
              title: "Cash Drawer",
              message: describeCashDrawerKickError(kick),
              type: "warning",
              duration: 4000,
            });
          }
        })
        .catch((err) =>
          console.warn("[CashPayment] Cash drawer auto-open failed:", err),
        );

      const amountTenderedNum = parseFloat(amountTendered) || 0;
      await handlePaymentCompletion({
        method: "Cash",
        tipAmount,
        transactionDetails: {
          amountTendered: amountTenderedNum,
          // Persist the change the cashier actually owes back so it lands on the
          // optimistic payment record immediately — no backend sync round-trip.
          // Powers the moment-of-sale receipt, success screen, and order history.
          changeGiven: Math.max(0, changeDue),
          isCashPriced: true,
        },
      });
      showApproved();
      // Do NOT reset isProcessing on success — the view is closing and frozen
      // totals must remain visible. Resetting would briefly show wrong change due
      // because handlePaymentCompletion already zeroed the order totals.
    } catch (error) {
      console.error("[CashPayment] Error processing payment:", error);
      showDeclined();
      toastService.show({
        title: "Payment Failed",
        message: error instanceof Error ? error.message : "Unknown error",
        type: "error",
        duration: 5000,
      });
      setIsProcessing(false);
    }
  };

  const handleBack = () => setView("payment-method-selection");

  const handleOpenDrawer = async () => {
    // Explicit operator action — be honest. Success is silent (the drawer
    // opening is its own confirmation); failure/unconfirmed surfaces a toast.
    try {
      const kick = await PrinterService.openCashDrawer({ trigger: "manual" });
      const outcome = classifyKickOutcome(kick);
      if (outcome === "failed") {
        toastService.show({
          title: "Drawer Did Not Open",
          message: describeCashDrawerKickError(kick),
          type: "error",
          duration: 5000,
        });
      } else if (outcome === "unconfirmed") {
        toastService.show({
          title: "Check the Drawer",
          message: DRAWER_UNCONFIRMED_MESSAGE,
          type: "warning",
          duration: 5000,
        });
      }
    } catch (err) {
      console.warn("[CashPayment] Manual drawer open failed:", err);
      toastService.show({
        title: "Drawer Did Not Open",
        message: "The cash drawer could not be opened.",
        type: "error",
        duration: 5000,
      });
    }
  };

  const numpadHandler = (btn: string) => {
    const setter = activeInput === "tendered" ? setAmountTendered : setCashTip;
    if (btn === "⌫") {
      setter((prev) => (prev.length <= 1 ? "" : prev.slice(0, -1)));
    } else if (btn === ".") {
      setter((prev) => {
        if (prev.includes(".")) return prev;
        return (prev || "0") + ".";
      });
    } else {
      setter((prev) => {
        if (!prev && btn === "0") return "0";
        const [, dec = ""] = prev.split(".");
        if (prev.includes(".") && dec.length >= 2) return prev;
        return prev + btn;
      });
    }
  };

  const handleSelectExact = () => {
    setAmountTendered(totalWithTip.toFixed(2));
    setActiveInput("tendered");
    setSelectedPreset("exact");
  };

  const handleSelectPreset = (amount: number) => {
    setAmountTendered(amount.toString());
    setActiveInput("tendered");
    setSelectedPreset(amount);
  };

  const eligiblePresets =
    totalWithTip > 100 ? [] : PRESET_BILLS.filter((b) => b > totalWithTip);
  const presetsRow1 = eligiblePresets.slice(0, 2);
  const presetsRow2 = eligiblePresets.slice(2);

  // Change calculator rows: bills to break down the change
  const changeBreakdown = computeChangeBreakdown(
    isSufficient ? displayChangeDue : 0,
  );

  const labelStyle = getLabelStyle(s);
  const inputStyle = getInputStyle(s);

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* ── Header ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: s(20),
          paddingVertical: s(12),
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.panel,
        }}
      >
        <TouchableOpacity
          onPress={handleBack}
          disabled={isProcessing}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(5),
            opacity: isProcessing ? 0.4 : 1,
            minWidth: s(72),
          }}
        >
          <ArrowLeft size={s(15)} color={colors.muted} />
          <Text
            style={{ color: colors.muted, fontSize: s(13), fontWeight: "600" }}
          >
            Back
          </Text>
        </TouchableOpacity>

        <Text
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: s(15),
            fontWeight: "700",
            color: colors.heading,
          }}
        >
          Cash Payment
        </Text>

        <View style={{ minWidth: s(72) }} />
      </View>

      {/* ── Body ── */}
      <View style={{ flex: 1, flexDirection: "column" }}>
        <View style={{ flex: 1, flexDirection: "row" }}>
          {/* ── LEFT PANEL ── */}
          <View
            style={{
              width: "44%",
              borderRightWidth: 1,
              borderRightColor: colors.border,
              padding: s(18),
            }}
          >
            <View style={{ gap: s(10) }}>
              {/* Total Due */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingBottom: s(10),
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: s(12),
                    fontWeight: "600",
                  }}
                >
                  Total Due
                </Text>
                <Text
                  style={{
                    fontSize: s(22),
                    fontWeight: "800",
                    color: colors.heading,
                  }}
                >
                  ${displayGrandTotal.toFixed(2)}
                </Text>
              </View>

              {/* Amount Received */}
              <View style={{ gap: s(5) }}>
                <Text style={labelStyle}>Amount Received</Text>
                <TouchableOpacity
                  onPress={() => setActiveInput("tendered")}
                  style={[
                    inputStyle,
                    {
                      borderColor:
                        activeInput === "tendered"
                          ? colors.teal
                          : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: colors.muted,
                      fontSize: s(16),
                      fontWeight: "600",
                    }}
                  >
                    $
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: s(20),
                      fontWeight: "700",
                      color: colors.heading,
                      marginLeft: s(4),
                    }}
                  >
                    {amountTendered || "0.00"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Cash Tip */}
              <View style={{ gap: s(5) }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={labelStyle}>Cash Tip (Optional)</Text>
                  <Text style={{ color: colors.muted, fontSize: s(10) }}>
                    Goes to server tip-out
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setActiveInput("tip")}
                  style={[
                    inputStyle,
                    {
                      height: s(42),
                      borderColor:
                        activeInput === "tip" ? colors.teal : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: colors.muted,
                      fontSize: s(15),
                      fontWeight: "600",
                    }}
                  >
                    $
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: s(17),
                      fontWeight: "600",
                      color: colors.heading,
                      marginLeft: s(4),
                    }}
                  >
                    {cashTip || "0.00"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Change Calculator */}
              <View
                style={{
                  backgroundColor: isSufficient
                    ? `${colors.teal}12`
                    : `${colors.panel}`,
                  borderRadius: s(10),
                  padding: s(14),
                  borderWidth: 1,
                  borderColor: isSufficient
                    ? `${colors.teal}40`
                    : colors.border,
                  gap: s(8),
                  marginTop: s(2),
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(10),
                      fontWeight: "700",
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                      color: isSufficient ? colors.teal : colors.muted,
                    }}
                  >
                    {isSufficient ? "Change Due" : "Still Owed"}
                  </Text>
                  <Text
                    style={{
                      fontSize: s(24),
                      fontWeight: "800",
                      color: isSufficient ? colors.teal : colors.muted,
                    }}
                  >
                    $
                    {isSufficient
                      ? displayChangeDue.toFixed(2)
                      : grandTotal - tendered > 0
                        ? (grandTotal - tendered).toFixed(2)
                        : "0.00"}
                  </Text>
                </View>
              </View>

              {/* Give Back section */}
              {changeBreakdown && changeBreakdown.length > 0 && (
                <View
                  style={{
                    backgroundColor: colors.panel,
                    borderRadius: s(10),
                    padding: s(14),
                    borderWidth: 1,
                    borderColor: colors.border,
                    gap: s(8),
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(10),
                      fontWeight: "700",
                      color: colors.teal,
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                    }}
                  >
                    Give back
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: s(6),
                    }}
                  >
                    {changeBreakdown.map(({ label, count }) => (
                      <View
                        key={label}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: s(3),
                          backgroundColor: colors.screen,
                          borderWidth: 1,
                          borderColor: `${colors.teal}30`,
                          borderRadius: s(6),
                          paddingHorizontal: s(10),
                          paddingVertical: s(4),
                        }}
                      >
                        <Text
                          style={{
                            color: colors.teal,
                            fontWeight: "700",
                            fontSize: s(12),
                          }}
                        >
                          {count}×
                        </Text>
                        <Text
                          style={{
                            color: colors.teal,
                            fontWeight: "600",
                            fontSize: s(12),
                          }}
                        >
                          {label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* ── RIGHT PANEL ── */}
          <View
            style={{
              flex: 1,
              paddingVertical: s(12),
              paddingHorizontal: s(16),
              justifyContent: "space-between",
            }}
          >
            {/* Numpad - centered */}
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <View style={{ gap: s(8), alignSelf: "center", width: "80%" }}>
                {[
                  ["1", "2", "3"],
                  ["4", "5", "6"],
                  ["7", "8", "9"],
                  [".", "0", "⌫"],
                ].map((row, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: s(8) }}>
                    {row.map((btn) => (
                      <TouchableOpacity
                        key={btn}
                        onPress={() => numpadHandler(btn)}
                        style={{
                          flex: 1,
                          height: s(54),
                          borderRadius: s(8),
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: colors.panel,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        {btn === "⌫" ? (
                          <Delete size={s(15)} color={colors.muted} />
                        ) : (
                          <Text
                            style={{
                              color: colors.heading,
                              fontSize: s(17),
                              fontWeight: "600",
                            }}
                          >
                            {btn}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}

                {/* Preset row 1: EXACT + $10 + $20 */}
                <View
                  style={{ flexDirection: "row", gap: s(8), marginTop: s(32) }}
                >
                  <TouchableOpacity
                    onPress={handleSelectExact}
                    style={{
                      flex: 1,
                      height: s(46),
                      borderRadius: s(8),
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor:
                        selectedPreset === "exact" ? colors.teal : colors.panel,
                      borderWidth: selectedPreset === "exact" ? 0 : 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color:
                          selectedPreset === "exact"
                            ? colors.onSolid
                            : colors.heading,
                        fontWeight: "700",
                        fontSize: s(9),
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                      }}
                    >
                      Exact
                    </Text>
                    <Text
                      style={{
                        color:
                          selectedPreset === "exact"
                            ? colors.onSolid
                            : colors.heading,
                        fontWeight: "800",
                        fontSize: s(11),
                      }}
                    >
                      ${totalWithTip.toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                  {presetsRow1.map((bill) => (
                    <TouchableOpacity
                      key={bill}
                      onPress={() => handleSelectPreset(bill)}
                      style={{
                        flex: 1,
                        height: s(46),
                        borderRadius: s(8),
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor:
                          selectedPreset === bill ? colors.teal : colors.panel,
                        borderWidth: selectedPreset === bill ? 0 : 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Text
                        style={{
                          color:
                            selectedPreset === bill
                              ? colors.onSolid
                              : colors.heading,
                          fontWeight: "700",
                          fontSize: s(12),
                        }}
                      >
                        ${bill}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Preset row 2: $50 + $100 */}
                {presetsRow2.length > 0 && (
                  <View style={{ flexDirection: "row", gap: s(8) }}>
                    {presetsRow2.map((bill) => (
                      <TouchableOpacity
                        key={bill}
                        onPress={() => handleSelectPreset(bill)}
                        style={{
                          flex: 1,
                          height: s(46),
                          borderRadius: s(8),
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor:
                            selectedPreset === bill
                              ? colors.teal
                              : colors.panel,
                          borderWidth: selectedPreset === bill ? 0 : 1,
                          borderColor: colors.border,
                        }}
                      >
                        <Text
                          style={{
                            color:
                              selectedPreset === bill
                                ? colors.onSolid
                                : colors.heading,
                            fontWeight: "700",
                            fontSize: s(12),
                          }}
                        >
                          ${bill}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* ── Bottom Bar ── */}
        <View
          style={{
            flexDirection: "row",
            borderTopWidth: 1,
            borderTopColor: colors.border,
            padding: s(12),
            gap: s(10),
            backgroundColor: colors.panel,
          }}
        >
          <TouchableOpacity
            onPress={handleOpenDrawer}
            style={{
              flex: 1,
              paddingVertical: s(14),
              borderRadius: s(9),
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: s(7),
              backgroundColor: colors.screen,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Printer size={s(15)} color={colors.muted} />
            <Text
              style={{
                color: colors.heading,
                fontWeight: "600",
                fontSize: s(13),
              }}
            >
              Open Drawer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleProcessCashPayment}
            disabled={(!isSufficient && total > 0) || isProcessing}
            style={{
              flex: 2,
              paddingVertical: s(14),
              borderRadius: s(9),
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: s(7),
              backgroundColor: colors.teal,
              opacity: (!isSufficient && total > 0) || isProcessing ? 0.35 : 1,
            }}
          >
            <Text
              style={{
                fontWeight: "600",
                fontSize: s(13),
                color: colors.onSolid,
              }}
            >
              {isProcessing ? "Processing..." : "Complete Order"}
            </Text>
            {!isProcessing && (
              <Text style={{ color: colors.onSolid, fontSize: s(13) }}>→</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const getLabelStyle = (s: (n: number) => number) => ({
  color: colors.muted,
  fontSize: s(10),
  fontWeight: "700" as const,
  textTransform: "uppercase" as const,
  letterSpacing: 0.8,
});

const getInputStyle = (s: (n: number) => number) => ({
  flexDirection: "row" as const,
  alignItems: "center" as const,
  backgroundColor: colors.panel,
  borderRadius: s(8),
  borderWidth: 1.5,
  paddingHorizontal: s(12),
  height: s(48),
});

export default CashPaymentView;
