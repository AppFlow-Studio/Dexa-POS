import { useToast } from "@/contexts/ToastContext";
import { orderHistoryKeys } from "@/hooks/orders/useOrderHistory";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { OrderProfile, OrderProfilePayment } from "@/lib/types";
import { adjustTips, TipAdjustment } from "@/services/tipAdjustService";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard } from "lucide-react-native";
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import { bottomSheetTheme } from "@/lib/theme";

interface TipAdjustSheetProps {
  order: OrderProfile | null;
}

export interface TipAdjustSheetRef {
  open: () => void;
  close: () => void;
}

const TipAdjustSheetComponent: React.ForwardRefRenderFunction<
  TipAdjustSheetRef,
  TipAdjustSheetProps
> = ({ order }, ref) => {
  const bottomSheetRef = useRef<BottomSheetMethods>(null);
  const snapPoints = useMemo(() => ["70%"], []);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    null,
  );
  const [tipInput, setTipInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { show } = useToast();
  const supabaseClient = useSupabaseClient();
  const queryClient = useQueryClient();

  useImperativeHandle(ref, () => ({
    open: () => {
      setSelectedPaymentId(null);
      setTipInput("");
      bottomSheetRef.current?.snapToIndex(0);
    },
    close: () => bottomSheetRef.current?.close(),
  }));

  const cardPayments = useMemo(() => {
    if (!order?.payments) return [];
    return order.payments.filter((p) => p.method !== "Cash" && !p.isVoided);
  }, [order?.payments]);

  const selectedPayment = useMemo(() => {
    if (!selectedPaymentId) return null;
    return cardPayments.find((p) => p.id === selectedPaymentId) || null;
  }, [selectedPaymentId, cardPayments]);

  const handleSubmit = useCallback(async () => {
    if (!order?.db_order_id || !selectedPayment?.db_payment_id) return;

    const newTip = parseFloat(tipInput);
    if (isNaN(newTip) || newTip < 0) {
      show({ title: "Invalid Amount", message: "Please enter a valid tip amount", type: "error" });
      return;
    }

    // High tip warning (>30% of payment amount)
    if (newTip > selectedPayment.amount * 0.3) {
      Alert.alert(
        "High Tip Warning",
        `$${newTip.toFixed(2)} is more than 30% of the payment amount ($${selectedPayment.amount.toFixed(2)}). Continue?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", onPress: () => submitTipAdjustment(newTip) },
        ],
      );
      return;
    }

    await submitTipAdjustment(newTip);
  }, [order, selectedPayment, tipInput]);

  const submitTipAdjustment = async (newTip: number) => {
    if (!order?.db_order_id || !selectedPayment?.db_payment_id) return;

    setIsSubmitting(true);
    try {
      const adjustment: TipAdjustment = {
        payment_id: selectedPayment.db_payment_id,
        new_tip_amount: newTip,
      };

      await adjustTips(supabaseClient, order.db_order_id, [adjustment]);
      show({ title: "Success", message: "Tip adjusted successfully", type: "success" });
      bottomSheetRef.current?.close();
      queryClient.invalidateQueries({ queryKey: orderHistoryKeys.all });
    } catch (err: any) {
      show({ title: "Error", message: err?.message || "Failed to adjust tip", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.7}
      />
    ),
    [],
  );

  if (!order) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      {...bottomSheetTheme}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-xl font-bold text-white mb-4">
          Adjust Tip
        </Text>

        {/* Payment selection */}
        {!selectedPaymentId ? (
          <View className="gap-2.5">
            <Text className="text-sm text-gray-400 mb-2">
              Select a payment to adjust tip:
            </Text>
            {cardPayments.map((payment, idx) => (
              <PaymentOption
                key={payment.id}
                payment={payment}
                index={idx}
                onSelect={() => {
                  setSelectedPaymentId(payment.id);
                  setTipInput(payment.tip_amount.toFixed(2));
                }}
              />
            ))}
          </View>
        ) : (
          <View>
            {/* Selected payment info */}
            <View className="bg-panel rounded-xl p-4 mb-4 border border-gray-700">
              <View className="flex-row items-center gap-2 mb-2">
                <CreditCard color={colors.info} size={18} />
                <Text className="text-base font-semibold text-white">
                  {selectedPayment?.cardBrand || "Card"}{" "}
                  {selectedPayment?.last4 ? `••${selectedPayment.last4}` : ""}
                </Text>
              </View>
              <Text className="text-sm text-gray-400">
                Payment: ${selectedPayment?.amount.toFixed(2)} | Current Tip: $
                {selectedPayment?.tip_amount.toFixed(2)}
              </Text>
            </View>

            {/* Tip input */}
            <Text className="text-sm text-gray-400 mb-2">New Tip Amount:</Text>
            <View className="flex-row items-center bg-panel rounded-xl px-4 py-3 border border-gray-600 mb-4">
              <Text className="text-xl text-gray-400 mr-1">$</Text>
              <TextInput
                value={tipInput}
                onChangeText={setTipInput}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#525252"
                className="flex-1 text-xl text-white font-semibold"
                autoFocus
              />
            </View>

            {/* Actions */}
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => {
                  setSelectedPaymentId(null);
                  setTipInput("");
                }}
                className="flex-1 py-3 rounded-xl border border-gray-600 items-center"
              >
                <Text className="text-base font-bold text-gray-400">Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={isSubmitting}
                className={`flex-1 py-3 rounded-xl items-center ${isSubmitting ? "bg-purple-900/50" : "bg-purple-600"}`}
              >
                <Text className="text-base font-bold text-white">
                  {isSubmitting ? "Adjusting..." : "Confirm"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
};

const PaymentOption = ({
  payment,
  index,
  onSelect,
}: {
  payment: OrderProfilePayment;
  index: number;
  onSelect: () => void;
}) => (
  <TouchableOpacity
    onPress={onSelect}
    activeOpacity={0.7}
    className="bg-panel rounded-xl p-4 border border-gray-700 flex-row items-center"
  >
    <CreditCard color={colors.label} size={20} />
    <View className="flex-1 ml-3">
      <Text className="text-base font-semibold text-white">
        Payment #{index + 1} — {payment.cardBrand || "Card"}{" "}
        {payment.last4 ? `••${payment.last4}` : ""}
      </Text>
      <Text className="text-sm text-gray-400">
        ${payment.amount.toFixed(2)} + ${payment.tip_amount.toFixed(2)} tip
      </Text>
    </View>
    <Text className="text-sm text-purple-400 font-semibold">Adjust</Text>
  </TouchableOpacity>
);

const AdvancedTipAdjustSheet = forwardRef(TipAdjustSheetComponent);
AdvancedTipAdjustSheet.displayName = "TipAdjustSheet";
export default AdvancedTipAdjustSheet;
