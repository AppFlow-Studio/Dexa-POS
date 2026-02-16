import { TerminalStatusBanner } from "@/components/payment/TerminalStatusBanner";
import { useCFD } from "@/contexts/CFDProvider";
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
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { CheckCircle2, Wifi } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    Text,
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

  // Logic: Simulate terminal interaction
  useEffect(() => {
    if (status === "processing") {
      const processPayment = async () => {
        if (!selectedStation?.payment_terminal) {
          throw new Error("No payment terminal selected");
        }
        try {
          const DejavooAPI = new DejavooSpinAPI(supabase);
          // 2. Load terminal credentials (fast path with local credentials)
          console.log(
            "[CashPayment] Loading terminal:",
            selectedStation?.payment_terminal,
          );
          const loaded = await DejavooAPI.loadTerminal(
            selectedStation?.payment_terminal?.id || "",
            selectedStation?.payment_terminal, // Pass local credentials for fast path
          );
          console.log("[CashPayment] Terminal loaded:", loaded);

          if (!loaded) {
            throw new Error("Failed to load terminal credentials");
          }

          // 3. Prepare transaction data
          const tipAmount = parseFloat(tipInput) || 0;
          // const amountTenderedNum = parseFloat(amountTendered) || 0;

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

          console.log("[CashPayment] Executing sale transaction...", {
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
            // .performedBy('cashier@pos.com') // TODO: Get from employee store
            // .withTags(
            //   activeSplit ? 'Split' : 'Full',
            //   activeOrderId?.substring(0, 8) || 'ORDER'
            // )
            .execute();

          // 5. Log complete response
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

          // 6. Handle result
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
                terminalType: "manual", // Default for now
                // authorizationCode: "AUTH" + Math.floor(Math.random() * 10000),
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
    <View className="flex-1 bg-[#212121]">
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
                          : "bg-[#333] border-[#404040]"
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
                <View className="flex-row items-center bg-[#2A2A2A] border border-[#333] rounded-xl px-4 h-16 w-full mb-8">
                  <Text className="text-gray-400 text-xl mr-2">$</Text>
                  <BottomSheetTextInput
                    value={tipInput}
                    onChangeText={handleTipInputChange}
                    placeholder="0.00"
                    keyboardType="numeric"
                    placeholderTextColor="#525252"
                    style={{
                      flex: 1,
                      fontSize: 24,
                      fontWeight: "bold",
                      color: "white",
                      height: "100%",
                    }}
                  />
                </View>

                <View className="flex-row justify-between w-full border-t border-[#333] pt-4">
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
                    <ActivityIndicator size="large" color="#3B82F6" />
                  </View>
                  <View className="flex-row items-center gap-2 bg-[#2A2A2A] px-4 py-2 rounded-full border border-[#333]">
                    <Wifi size={16} color="#10B981" />
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
                    <CheckCircle2 size={48} color="#10B981" />
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
            <View className="bg-[#2A2A2A] p-5 rounded-2xl border border-[#333333] mb-6">
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

                  <View className="flex-row justify-between pt-3 border-t border-[#404040]">
                    <Text className="text-gray-400 text-base">Tax</Text>
                    <Text className="text-white text-base font-medium">
                      ${activeOrderOutstandingTax.toFixed(2)}
                    </Text>
                  </View>
                </>
              )}
              {tipAmount > 0 && (
                <View className="flex-row justify-between pt-3 border-t border-[#404040] mt-3">
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
                  try {
                    const DejavooAPI = new DejavooSpinAPI(supabase);
                    await DejavooAPI.loadTerminal(
                      selectedStation?.payment_terminal?.id || "",
                      selectedStation?.payment_terminal,
                    );
                    await DejavooAPI.abortTransaction()
                      .referenceId(currentRefIdRef.current)
                      .execute();
                  } catch (err) {
                    console.error("[CardPayment] Abort failed:", err);
                  }
                  setIsCancelling(false);
                  setStatus("ready");
                } else {
                  close();
                }
              }}
              className={`w-full py-4 bg-[#2A2A2A] border border-[#404040] rounded-xl active:bg-[#333] ${isCancelling ? "opacity-50" : ""}`}
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
