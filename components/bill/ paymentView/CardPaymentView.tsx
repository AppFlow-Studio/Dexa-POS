import { TerminalStatusBanner } from "@/components/payment/TerminalStatusBanner";
import { useCFD } from "@/contexts/CFDProvider";
import { colors } from "@/lib/theme";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useTerminalStatus } from "@/hooks/useTerminalStatus";
import {
    categorizeError,
    getErrorTitle,
    getTerminalErrorMessage,
    isTerminalConnectivityError,
} from "@/lib/payments/dejavoo-error-detector";
import { DejavooSpinAPI } from "@/lib/payments/dejavoo-spin-api";
import { PaymentErrorModal } from "@/components/bill/paymentView/PaymentErrorModal";
import { toastService } from "@/lib/toastService";
import { useActiveOrder, useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentTerminalStore } from "@/stores/usePaymentTerminalStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { generateRefId } from "@/types/dejavoo-spin-api";
import { getSharedCastlesService } from "@/services/terminals/castles-service";
import { getOrCreateCounter } from "@/services/terminals/castles-txn-counter";
import { extractLast4, parseCastlesReturnCode } from "@/services/terminals/castles-response-mapper";
import { CASTLES_DEFAULT_PORT } from "@/types/castles";
import { CheckCircle2, Wifi } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
const CardPaymentView = () => {
  // Refresh order data on mount and realtime reconnection
  // useRefreshActiveOrder(); -> REMOVED to prevent overwriting local discount state with stale backend data
  const supabase = useSupabaseClient();
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const orderTotals = useActiveOrderTotals();
  const activeOrderDiscount = orderTotals?.discount ?? 0;
  const activeOrderOutstandingSubtotal = orderTotals?.outstandingSubtotal ?? 0;
  const activeOrderOutstandingTax = orderTotals?.outstandingTax ?? 0;
  const activeOrderOutstandingTotal = orderTotals?.amountDue ?? 0;
  const activeOrderTotal = orderTotals?.total ?? 0;

  const close = usePaymentStore((s) => s.close);
  const handlePaymentCompletion = usePaymentStore((s) => s.handlePaymentCompletion);
  const activeSplitId = usePaymentStore((s) => s.activeSplitId);
  const splits = usePaymentStore((s) => s.splits);
  const expandSheetToFull = usePaymentStore((s) => s.expandSheetToFull);
  const setTransactionProcessing = usePaymentStore((s) => s.setTransactionProcessing);

  // Expand bottom sheet to full height when entering card payment view
  useEffect(() => {
    expandSheetToFull();
  }, [expandSheetToFull]);
  const [status, setStatus] = useState<
    "ready" | "processing" | "rejected" | "success"
  >("ready");
  const [tipInput, setTipInput] = useState("");
  const [selectedTipPreset, setSelectedTipPreset] = useState<number | null>(
    null,
  );
  const [dejavooError, setDejavooError] = useState<string | null>(null);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: "",
    message: "",
  });
  const currentRefIdRef = useRef<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Sync isTransactionProcessing with status and error modal
  useEffect(() => {
    setTransactionProcessing(status === "processing" || errorModal.visible);
    return () => { setTransactionProcessing(false); };
  }, [status, errorModal.visible, setTransactionProcessing]);

  // Signal health check service to skip during active terminal interaction
  useEffect(() => {
    const isActive = status === "processing";
    usePaymentTerminalStore.getState().setProcessingPayment(isActive);
    return () => { usePaymentTerminalStore.getState().setProcessingPayment(false); };
  }, [status]);

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
    showIdle,
  } = useCFD();

  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  // console.log('selectedStation', selectedStation);

  // Check terminal status on mount
  const {
    status: terminalStatus,
    isReady: terminalReady,
    errorMessage: terminalErrorMessage,
    recheckStatus,
  } = useTerminalStatus(
    selectedStation?.payment_terminal?.id,
    selectedStation?.payment_terminal,
  );

  const tipPresetPercentages = useStoreSettingsStore((s) => s.tipPresetPercentages);
  const TIP_PRESETS = tipPresetPercentages;

  // Get the active order for backend amount_due
  const activeOrder = useActiveOrder();

  const handleTipPreset = (percentage: number) => {
    const calculatedTip = (percentage / 100) * totalToPay;
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

  // --- LOGIC: DETERMINE AMOUNT TO PAY ---
  const activeSplit = splits.find((s) => s.id === activeSplitId);
  // Priority: local store outstanding total (has discounts) > backend amount_due > full order total
  // Note: useRefreshActiveOrder ensures data is fresh on mount and reconnection
  // But local store has the most up-to-date discount calculations
  const effectiveOutstandingTotal =
    activeOrderOutstandingTotal > 0
      ? activeOrderOutstandingTotal
      : activeOrder?.amount_due !== undefined && activeOrder.amount_due >= 0.01
        ? activeOrder.amount_due
        : activeOrderTotal;
  const totalToPay = activeSplit
    ? activeSplit.amount
    : effectiveOutstandingTotal;
  console.log("CardPaymentView", activeOrderOutstandingTotal);
  const tipAmount = parseFloat(tipInput) || 0;
  const grandTotal = totalToPay + tipAmount;

  // Sync with CFD Tip Selection
  useEffect(() => {
    if (status === "ready") {
      showTipSelection(totalToPay, TIP_PRESETS);

      // Resync existing tip selection if state persisted
      const currentTipAmount = parseFloat(tipInput) || 0;
      if (currentTipAmount > 0 || selectedTipPreset !== null) {
        updateTip(currentTipAmount, selectedTipPreset);
      }

      clearTipResponse();
    }

    // Cleanup: Reset CFD state when leaving the card payment view
    return () => {
      setScreenState(null);
      setBaseAmount(null);
    };
  }, [status]); // Only trigger when entering ready state

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

  // Logic: Process terminal payment (Castles or Dejavoo)
  useEffect(() => {
    if (status === "processing") {
      const processPayment = async () => {
        if (!selectedStation?.payment_terminal) {
          throw new Error("No payment terminal selected");
        }
        const terminal = selectedStation.payment_terminal;
        const tipAmount = parseFloat(tipInput) || 0;

        try {
          // ============ CASTLES BRANCH ============
          if (terminal.terminal_type === 'castles') {
            const host = terminal.ip_address;
            if (!host) throw new Error("Castles terminal has no IP address configured");
            const port = terminal.port ?? CASTLES_DEFAULT_PORT;

            console.log("[CardPayment] Castles sale flow:", { host, port, totalToPay, tipAmount, grandTotal });

            // 1. Connect + reset (shared singleton — one socket to the terminal)
            const service = getSharedCastlesService();
            await service.connect({ host, port, timeout: 120_000, terminalId: terminal.id });
            await service.resetTerminalState();

            // 2. Get counter for txnPosTxnId
            const counter = getOrCreateCounter({
              terminalId: terminal.id,
              supabaseClient: supabase,
            });
            if (!counter.isInitialized) await counter.initialize();
            const referenceId = counter.next();
            currentRefIdRef.current = referenceId;

            console.log("[CardPayment] Castles processSale:", { amount: totalToPay, tipAmount, referenceId });

            // 3. Execute sale — amount is base (without tip); terminal adds tip separately
            const result = await service.processSale({
              amount: totalToPay,
              tipAmount,
              referenceId,
            });

            console.log("[CardPayment] Castles sale result:", {
              success: result.success,
              error: result.error,
              hasRaw: !!result.raw,
            });

            // 4. Handle failure
            if (!result.success) {
              const errorInfo = result.raw?.txnReturnCode
                ? parseCastlesReturnCode(result.raw.txnReturnCode)
                : { message: result.error || "Transaction failed" };
              showDeclined();
              setErrorModal({
                visible: true,
                title: "Payment Declined",
                message: errorInfo.message,
              });
              return;
            }

            // 5. Handle success
            showApproved();
            setStatus("success");
            const castlesTx = result.terminalResponse?.castles_transaction as Record<string, string> | undefined;
            handlePaymentCompletion({
              method: "Card",
              tipAmount,
              transactionDetails: {
                terminalType: "castles",
                isCashPriced: false,
                authorizationCode: castlesTx?.approvalCode,
                cardType: castlesTx?.cardType,
                last4: castlesTx?.cardLast4 ?? (result.raw ? extractLast4(result.raw.txnMaskedCardNum ?? result.raw.txnCardMaskedPan ?? '') : undefined),
                transactionId: referenceId,
                castlesTransaction: result.terminalResponse,
              },
              amountOverride: totalToPay,
            });
            return;
          }

          // ============ DEJAVOO BRANCH (default) ============
          const DejavooAPI = new DejavooSpinAPI(supabase);
          console.log(
            "[CardPayment] Loading Dejavoo terminal:",
            terminal,
          );
          const loaded = await DejavooAPI.loadTerminal(
            terminal.id || "",
            terminal,
          );
          console.log("[CardPayment] Terminal loaded:", loaded);

          if (!loaded) {
            throw new Error("Failed to load terminal credentials");
          }

          // Generate unique RefId
          const locSuffix = selectedStore?.id?.slice(-4) ?? '';
          const staSuffix = selectedStation?.id?.slice(-4) ?? '';
          const refId = activeSplit
            ? generateRefId(
                "CARD",
                parseInt(activeSplitId?.split("_")[1] || "0"),
                locSuffix,
                staSuffix,
              )
            : generateRefId("CARD", undefined, locSuffix, staSuffix);
          currentRefIdRef.current = refId;

          console.log("[CardPayment] Executing Dejavoo sale transaction...", {
            grandTotal: grandTotal,
            amount: totalToPay,
            tip: tipAmount,
            refId,
            split: activeSplit?.customerName,
          });

          const result = await DejavooAPI.sale()
            .amount(grandTotal)
            .tip(tipAmount)
            .paymentType("Credit")
            .refId(refId)
            .execute();

          // Log complete response
          console.log("=== DEJAVOO SALE RESPONSE ===");
          console.log("Success:", result.success);
          console.log(
            "Raw Response:",
            JSON.stringify(result.rawResponse, null, 2),
          );

          if (result.helpers) {
            console.log("=== RESPONSE HELPERS ===");
            console.log("Reference ID:", result.helpers.getReferenceId());
            console.log(
              "Transaction Number:",
              result.helpers.getTransactionNumber(),
            );
            console.log("Invoice Number:", result.helpers.getInvoiceNumber());
            console.log("RRN:", result.helpers.getRRN());

            console.log("Batch Number:", result.helpers.getBatchNumber());
            console.log("Auth Number:", result.helpers.getAuthCode());
            console.log("Total Amount:", result.helpers.getTotalAmount());
            console.log("Base Amount:", result.helpers.getBaseAmount());
            console.log("Tip Amount:", result.helpers.getTipAmount());
            console.log("Card Type:", result.helpers.getCardType());
            console.log("Card Last 4:", result.helpers.getCardLast4());
            console.log("Entry Mode:", result.helpers.getEntryMode());
            console.log("Cardholder Name:", result.helpers.getCardholderName());
            console.log("Is Approved:", result.helpers.isApproved());
            console.log("Result Code:", result.helpers.getResultCode());
            console.log("Status Code:", result.helpers.getStatusCode());
            console.log("Message:", result.helpers.getMessage());
          }
          console.log("=== END DEJAVOO RESPONSE ===");

          // Handle result
          // Check for terminal connectivity error first
          if (!result.success && isTerminalConnectivityError(result)) {
            const errorMsg = getTerminalErrorMessage(result);
            toastService.show({
              title: "Terminal Disconnected",
              message: errorMsg,
              type: "error",
              duration: 5000,
            });
            showIdle();
            close(); // Immediate safe close
            return;
          }

          // Handle all other transaction errors (declined, timeout, etc.)
          if (!result.success) {
            const errorType = categorizeError(result);
            showDeclined();
            setErrorModal({
              visible: true,
              title: getErrorTitle(errorType),
              message: getTerminalErrorMessage(result),
            });
            return;
          }

          // Success
          if (result.success) {
            showApproved();
            setStatus("success");
            const rawResponse = result.rawResponse as Record<string, any> | undefined;
            const generalResponse = rawResponse?.GeneralResponse;
            const cardData = rawResponse?.CardData;
            const emvRaw = rawResponse?.EMVData;
            const amountsRaw = rawResponse?.Amounts;
            const amounts = {
              totalAmount:
                amountsRaw?.TotalAmount ?? result.helpers?.getTotalAmount(),
              amount: amountsRaw?.Amount ?? result.helpers?.getBaseAmount(),
              tipAmount: amountsRaw?.TipAmount ?? result.helpers?.getTipAmount(),
              feeAmount: amountsRaw?.FeeAmount,
              taxAmount: amountsRaw?.TaxAmount,
            };
            const emvData = emvRaw
              ? {
                  applicationName: emvRaw?.ApplicationName,
                  aid: emvRaw?.AID,
                  tvr: emvRaw?.TVR,
                  tsi: emvRaw?.TSI,
                  iad: emvRaw?.IAD,
                  arc: emvRaw?.ARC,
                }
              : undefined;
            const dejavooTransaction = {
              referenceId: result.helpers?.getReferenceId() ?? rawResponse?.ReferenceId,
              transactionNumber:
                result.helpers?.getTransactionNumber() ??
                rawResponse?.TransactionNumber,
              invoiceNumber:
                result.helpers?.getInvoiceNumber() ?? rawResponse?.InvoiceNumber,
              batchNumber:
                result.helpers?.getBatchNumber() ?? rawResponse?.BatchNumber,
              authCode: result.helpers?.getAuthCode() ?? rawResponse?.AuthCode,
              totalAmount: amounts.totalAmount,
              baseAmount: amounts.amount,
              tipAmount: amounts.tipAmount,
              cardType: result.helpers?.getCardType() ?? cardData?.CardType,
              cardLast4: result.helpers?.getCardLast4() ?? cardData?.Last4,
              entryMode: result.helpers?.getEntryMode() ?? cardData?.EntryType,
              entryType: cardData?.EntryType,
              resultCode:
                result.helpers?.getResultCode() ?? generalResponse?.ResultCode,
              statusCode:
                result.helpers?.getStatusCode() ?? generalResponse?.StatusCode,
              message: result.helpers?.getMessage() ?? generalResponse?.Message,
              rrn: result.helpers?.getRRN() ?? rawResponse?.RRN,
              pnReferenceId:
                rawResponse?.PNRef ?? rawResponse?.PNReferenceId,
              transactionType:
                result.helpers?.getTransactionType() ??
                rawResponse?.TransactionType,
              serialNumber: rawResponse?.SerialNumber,
              hostResponseCode:
                generalResponse?.HostResponseCode ?? generalResponse?.StatusCode,
              hostResponseMessage:
                generalResponse?.HostResponseMessage ??
                generalResponse?.Message,
              resultMessage: generalResponse?.Message,
              amounts,
              emvData,
            };
            handlePaymentCompletion({
              method: "Card",
              tipAmount: tipAmount,
              transactionDetails: {
                terminalType: "dejavoo",
                isCashPriced: false, // Explicit card pricing
                authorizationCode: dejavooTransaction.authCode,
                cardType: dejavooTransaction.cardType,
                last4: dejavooTransaction.cardLast4,
                transactionId: dejavooTransaction.referenceId,
                dejavooTransaction,
              },
              amountOverride: totalToPay,
            });
          }
        } catch (error) {
          console.error("[CardPayment] Error processing payment:", error);
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          showDeclined();
          setErrorModal({
            visible: true,
            title: "Payment Failed",
            message: errorMsg,
          });
          return;
        }
      };
      processPayment();
    }
  }, [status]);

  // Logic: Handle Success
  useEffect(() => {
    if (status === "success" && activeOrderId) {
      // Use central handler instead of direct store call
      // Pass the tip amount and explicit card pricing flag
     
    }
  }, [status, activeOrderId, handlePaymentCompletion, tipAmount]);

  const handleDismissErrorModal = () => {
    setErrorModal({ visible: false, title: "", message: "" });
    setDejavooError(null);
    setStatus("ready");
  };

  const handleChargeCard = () => {
    setStatus("processing");
    showProcessing();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "space-between", padding: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Terminal Status Banner */}
        {terminalStatus !== "online" && (
          <View style={{ marginBottom: 16 }}>
            <TerminalStatusBanner
              status={terminalStatus}
              errorMessage={terminalErrorMessage || undefined}
              onRetry={recheckStatus}
            />
          </View>
        )}

        {/* Top Section */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {/* READY STATE */}
          {status === "ready" && (
            <View style={{ width: "100%", maxWidth: 400 }}>
              <View style={{ alignItems: "center", marginBottom: 24 }}>
                <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Total Due</Text>
                <Text style={{ fontSize: 48, fontWeight: "700", color: colors.teal, marginBottom: 28 }}>
                  ${totalToPay.toFixed(2)}
                </Text>

                <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, alignSelf: "flex-start" }}>
                  Add Tip
                </Text>
                {/* Preset Tip Buttons */}
                <View style={{ flexDirection: "row", gap: 8, width: "100%", marginBottom: 12 }}>
                  {TIP_PRESETS.map((percent) => {
                    const isActive = selectedTipPreset === percent;
                    return (
                      <TouchableOpacity
                        key={percent}
                        onPress={() => handleTipPreset(percent)}
                        style={{
                          flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
                          backgroundColor: isActive ? `${colors.teal}15` : colors.panel,
                          borderColor: isActive ? colors.teal : colors.border,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ fontWeight: "700", color: isActive ? colors.heading : colors.muted }}>{percent}%</Text>
                        <Text style={{ fontSize: 11, marginTop: 2, color: isActive ? colors.teal : colors.muted }}>
                          ${((percent / 100) * totalToPay).toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {/* Custom Tip Input */}
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, height: 56, width: "100%", marginBottom: 24 }}>
                  <Text style={{ color: colors.muted, fontSize: 18, marginRight: 6 }}>$</Text>
                  <TextInput
                    value={tipInput}
                    onChangeText={handleTipInputChange}
                    placeholder="0.00"
                    keyboardType="numeric"
                    placeholderTextColor={colors.muted}
                    style={{ flex: 1, fontSize: 22, fontWeight: "700", color: colors.heading }}
                  />
                </View>

                <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }}>
                  <Text style={{ color: colors.muted, fontSize: 16 }}>Grand Total</Text>
                  <Text style={{ color: colors.heading, fontSize: 16, fontWeight: "700" }}>${grandTotal.toFixed(2)}</Text>
                </View>
              </View>
            </View>
          )}

          {/* PROCESSING / SUCCESS STATES */}
          {(status === "processing" || status === "success") && (
            <View style={{ marginBottom: 24, alignItems: "center" }}>
              {status === "processing" && (
                <Animated.View entering={FadeIn} style={{ alignItems: "center" }}>
                  <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: `${colors.teal}15`, alignItems: "center", justifyContent: "center", marginBottom: 16, borderWidth: 2, borderColor: `${colors.teal}30` }}>
                    <ActivityIndicator size="large" color={colors.teal} />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.panel, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border }}>
                    <Wifi size={16} color={colors.success} />
                    <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 13 }}>Terminal Connected</Text>
                  </View>
                </Animated.View>
              )}

              {status === "success" && (
                <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: "center" }}>
                  <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: `${colors.success}15`, alignItems: "center", justifyContent: "center", marginBottom: 16, borderWidth: 2, borderColor: `${colors.success}30` }}>
                    <CheckCircle2 size={48} color={colors.success} />
                  </View>
                  <Text style={{ color: colors.success, fontWeight: "700", fontSize: 16 }}>Approved</Text>
                </Animated.View>
              )}

              <View style={{ marginTop: 24, alignItems: "center" }}>
                <Text style={{ fontSize: 28, fontWeight: "700", color: colors.heading, marginBottom: 6, textAlign: "center" }}>
                  {status === "processing" ? "Present Card" : "Payment Successful"}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 16, textAlign: "center" }}>
                  {status === "processing" ? `Charging $${grandTotal.toFixed(2)}` : "Transaction completed"}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Payment Error Modal */}
        <PaymentErrorModal
          visible={errorModal.visible}
          title={errorModal.title}
          message={errorModal.message}
          onDismiss={handleDismissErrorModal}
        />

        {/* Bottom Section */}
        <Animated.View entering={FadeInDown.delay(200)} style={{ width: "100%" }}>
          {/* Receipt Breakdown */}
          {status !== "ready" && (
            <View style={{ backgroundColor: colors.panel, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
              {activeSplit ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.muted, fontSize: 15 }}>{activeSplit.customerName} Share</Text>
                  <Text style={{ color: colors.heading, fontSize: 15, fontWeight: "600" }}>${activeSplit.amount.toFixed(2)}</Text>
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
                    <Text style={{ color: colors.muted, fontSize: 15 }}>Subtotal</Text>
                    <Text style={{ color: colors.heading, fontSize: 15, fontWeight: "600" }}>${activeOrderOutstandingSubtotal.toFixed(2)}</Text>
                  </View>
                  {activeOrderDiscount > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
                      <Text style={{ color: colors.success, fontSize: 15 }}>Discount</Text>
                      <Text style={{ color: colors.success, fontSize: 15, fontWeight: "600" }}>-${activeOrderDiscount.toFixed(2)}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <Text style={{ color: colors.muted, fontSize: 15 }}>Tax</Text>
                    <Text style={{ color: colors.heading, fontSize: 15, fontWeight: "600" }}>${activeOrderOutstandingTax.toFixed(2)}</Text>
                  </View>
                </>
              )}
              {tipAmount > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 10 }}>
                  <Text style={{ color: colors.muted, fontSize: 15 }}>Tip</Text>
                  <Text style={{ color: colors.heading, fontSize: 15, fontWeight: "600" }}>${tipAmount.toFixed(2)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Charge Button */}
          {status === "ready" && (
            <TouchableOpacity
              onPress={handleChargeCard}
              disabled={!terminalReady}
              style={{
                width: "100%", paddingVertical: 16, borderRadius: 12, marginBottom: 12,
                alignItems: "center",
                backgroundColor: terminalReady ? colors.teal : colors.panel,
                borderWidth: terminalReady ? 0 : 1,
                borderColor: colors.border,
                opacity: terminalReady ? 1 : 0.5,
              }}
            >
              <Text style={{ color: terminalReady ? "#000" : colors.muted, fontWeight: "700", fontSize: 17 }}>
                Charge Card ${grandTotal.toFixed(2)}
              </Text>
            </TouchableOpacity>
          )}

          {(status === "processing" || status === "ready") && (
            <TouchableOpacity
              disabled={isCancelling}
              onPress={async () => {
                if (isCancelling) return;
                if (status === "processing" && currentRefIdRef.current) {
                  setIsCancelling(true);
                  const terminal = selectedStation?.payment_terminal;
                  try {
                    if (terminal?.terminal_type === 'castles') {
                      await getSharedCastlesService().gracefulDisconnect();
                    } else if (terminal) {
                      const DejavooAPI = new DejavooSpinAPI(supabase);
                      await DejavooAPI.loadTerminal(terminal.id || "", terminal);
                      await DejavooAPI.abortTransaction().referenceId(currentRefIdRef.current).execute();
                    }
                  } catch (err) {
                    console.error("[CardPayment] Abort failed:", err);
                  }
                  setIsCancelling(false);
                  setStatus("ready");
                } else {
                  close();
                }
              }}
              style={{ width: "100%", paddingVertical: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, opacity: isCancelling ? 0.5 : 1 }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.muted, textAlign: "center" }}>
                {isCancelling ? "Cancelling..." : "Cancel Transaction"}
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
};

export default CardPaymentView;
