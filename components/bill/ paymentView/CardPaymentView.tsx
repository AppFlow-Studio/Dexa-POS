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
import { CastlesService } from "@/services/terminals/castles-service";
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
  const castlesServiceRef = useRef<CastlesService | null>(null);
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

  const TIP_PRESETS = [18, 20, 25];

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
      showTipSelection(totalToPay, [18, 20, 25]);

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

            // 1. Connect + reset
            const service = new CastlesService();
            castlesServiceRef.current = service;
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

            // Clean up socket after sale
            await service.gracefulDisconnect();
            castlesServiceRef.current = null;

            // 4. Handle failure
            if (!result.success) {
              const errorInfo = result.raw?.txnReturnCode
                ? parseCastlesReturnCode(result.raw.txnReturnCode)
                : { message: result.error || "Transaction failed" };
              setErrorModal({
                visible: true,
                title: "Payment Declined",
                message: errorInfo.message,
              });
              return;
            }

            // 5. Handle success
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
            close(); // Immediate safe close
            return;
          }

          // Handle all other transaction errors (declined, timeout, etc.)
          if (!result.success) {
            const errorType = categorizeError(result);
            setErrorModal({
              visible: true,
              title: getErrorTitle(errorType),
              message: getTerminalErrorMessage(result),
            });
            return;
          }

          // Success
          if (result.success) {
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
  };

  return (
    <View className="flex-1 bg-panel">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "space-between",
          padding: 16,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Terminal Status Banner */}
        {terminalStatus !== "online" && (
          <View className="mb-4">
            <TerminalStatusBanner
              status={terminalStatus}
              errorMessage={terminalErrorMessage || undefined}
              onRetry={recheckStatus}
            />
          </View>
        )}

        {/* Top Section: Status Indicator */}
        <View className="items-center justify-center flex-1">
          {/* READY STATE: Tip Input */}
          {status === "ready" && (
            <View className="w-full max-w-sm">
              <View className="items-center mb-8">
                <Text className="text-gray-400 text-lg mb-2">Total Due</Text>
                <Text className="text-5xl font-bold text-white mb-8">
                  ${totalToPay.toFixed(2)}
                </Text>

                <Text className="text-gray-400 mb-2 font-medium self-start w-full">
                  Add Tip
                </Text>
                {/* Preset Tip Buttons */}
                <View className="flex-row gap-2 w-full mb-4">
                  {TIP_PRESETS.map((percent) => (
                    <TouchableOpacity
                      key={percent}
                      onPress={() => handleTipPreset(percent)}
                      className={`flex-1 py-3 rounded-xl border ${
                        selectedTipPreset === percent
                          ? "bg-blue-600 border-blue-500"
                          : "bg-surface border-border"
                      }`}
                    >
                      <Text
                        className={`text-center font-bold ${
                          selectedTipPreset === percent
                            ? "text-white"
                            : "text-gray-300"
                        }`}
                      >
                        {percent}%
                      </Text>
                      <Text
                        className={`text-center text-xs mt-1 ${
                          selectedTipPreset === percent
                            ? "text-blue-200"
                            : "text-gray-500"
                        }`}
                      >
                        ${((percent / 100) * totalToPay).toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {/* Custom Tip Input */}
                <View className="flex-row items-center bg-surface border border-border rounded-xl px-4 h-16 w-full mb-8">
                  <Text className="text-gray-400 text-xl mr-2">$</Text>
                  <TextInput
                    value={tipInput}
                    onChangeText={handleTipInputChange}
                    placeholder="0.00"
                    keyboardType="numeric"
                    placeholderTextColor={colors.muted}
                    style={{
                      flex: 1,
                      fontSize: 24,
                      fontWeight: "bold",
                      color: "white",
                      height: "100%",
                    }}
                  />
                </View>

                <View className="flex-row justify-between w-full border-t border-border pt-4">
                  <Text className="text-gray-300 text-xl">Grand Total:</Text>
                  <Text className="text-white text-xl font-bold">
                    ${grandTotal.toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* PROCESSING / SUCCESS STATES */}
          {(status === "processing" || status === "success") && (
            <View className="mb-8">
              {status === "processing" && (
                <Animated.View entering={FadeIn} className="items-center">
                  <View className="w-24 h-24 bg-blue-600/10 rounded-full items-center justify-center mb-4 border-2 border-blue-500/20">
                    <ActivityIndicator size="large" color={colors.info} />
                  </View>
                  <View className="flex-row items-center gap-2 bg-surface px-4 py-2 rounded-full border border-border">
                    <Wifi size={16} color={colors.success} />
                    <Text className="text-gray-400 font-medium text-sm">
                      Terminal Connected
                    </Text>
                  </View>
                </Animated.View>
              )}

              {status === "success" && (
                <Animated.View
                  entering={FadeIn.duration(300)}
                  className="items-center"
                >
                  <View className="w-24 h-24 bg-green-500/10 rounded-full items-center justify-center mb-4 border-2 border-green-500/20">
                    <CheckCircle2 size={48} color={colors.success} />
                  </View>
                  <Text className="text-green-400 font-bold text-lg">
                    Approved
                  </Text>
                </Animated.View>
              )}

              <View className="mt-8 items-center">
                <Text className="text-3xl font-bold text-white mb-2 text-center">
                  {status === "processing"
                    ? "Present Card"
                    : "Payment Successful"}
                </Text>
                <Text className="text-gray-400 text-lg text-center">
                  {status === "processing"
                    ? `Charging $${grandTotal.toFixed(2)}`
                    : "Transaction completed"}
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
        {/* Bottom Section: Receipt Details & Actions */}
        <Animated.View entering={FadeInDown.delay(200)} className="w-full">
          {/* Receipt Breakdown Card */}
          {/* Only show simplified breakdown or nothing in ready state if unnecessary, keeping consistent for now */}
          {status !== "ready" && (
            <View className="bg-surface p-5 rounded-2xl border border-border mb-6">
              {activeSplit ? (
                <View className="flex-row justify-between">
                  <Text className="text-gray-400 text-base">
                    {activeSplit.customerName} Share
                  </Text>
                  <Text className="text-white text-base font-medium">
                    ${activeSplit.amount.toFixed(2)}
                  </Text>
                </View>
              ) : (
                <>
                  <View className="flex-row justify-between mb-3">
                    <Text className="text-gray-400 text-base">Subtotal</Text>
                    <Text className="text-white text-base font-medium">
                      ${activeOrderOutstandingSubtotal.toFixed(2)}
                    </Text>
                  </View>

                  {activeOrderDiscount > 0 && (
                    <View className="flex-row justify-between mb-3">
                      <Text className="text-green-500/80 text-base">
                        Discount
                      </Text>
                      <Text className="text-green-500 font-medium text-base">
                        -${activeOrderDiscount.toFixed(2)}
                      </Text>
                    </View>
                  )}

                  <View className="flex-row justify-between pt-3 border-t border-border">
                    <Text className="text-gray-400 text-base">Tax</Text>
                    <Text className="text-white text-base font-medium">
                      ${activeOrderOutstandingTax.toFixed(2)}
                    </Text>
                  </View>
                </>
              )}
              {tipAmount > 0 && (
                <View className="flex-row justify-between pt-3 border-t border-border mt-3">
                  <Text className="text-gray-400 text-base">Tip</Text>
                  <Text className="text-white text-base font-medium">
                    ${tipAmount.toFixed(2)}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Action Buttons */}
          {status === "ready" && (
            <TouchableOpacity
              onPress={handleChargeCard}
              disabled={!terminalReady}
              className={`w-full py-4 rounded-xl mb-4 items-center ${
                terminalReady
                  ? "bg-blue-600 active:bg-blue-700"
                  : "bg-gray-600 opacity-50"
              }`}
            >
              <Text className="text-white font-bold text-lg">
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
                  // Abort in-flight transaction on terminal
                  setIsCancelling(true);
                  const terminal = selectedStation?.payment_terminal;
                  try {
                    if (terminal?.terminal_type === 'castles' && castlesServiceRef.current) {
                      // Castles: graceful disconnect sends return2Idle + clean close
                      await castlesServiceRef.current.gracefulDisconnect();
                      castlesServiceRef.current = null;
                    } else if (terminal && terminal.terminal_type !== 'castles') {
                      // Dejavoo: abort via SPIN API
                      const DejavooAPI = new DejavooSpinAPI(supabase);
                      await DejavooAPI.loadTerminal(
                        terminal.id || "",
                        terminal,
                      );
                      await DejavooAPI.abortTransaction()
                        .referenceId(currentRefIdRef.current)
                        .execute();
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
              className={`w-full py-4 bg-surface border border-border rounded-xl active:bg-surface ${isCancelling ? "opacity-50" : ""}`}
            >
              <Text className="text-lg font-bold text-gray-300 text-center">
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
