import { useOrderStore } from "@/stores/useOrderStore"; // Import the store
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { X } from "lucide-react-native";
import React, { forwardRef, useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface PricingBreakdownSheetProps {
  onClose: () => void;
  onPressProceedToPayment: () => void;
  /** The correct total amount to display - passed from parent which has fresh data */
  totalDisplayAmount: number;
  /** Whether the order has payments - passed from parent for reliable detection */
  hasPayments?: boolean;
}

const PricingBreakdownSheetComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  PricingBreakdownSheetProps
> = function PricingBreakdownSheetComponent(
  {
    onClose,
    onPressProceedToPayment,
    totalDisplayAmount,
    hasPayments: hasPaymentsProp,
  },
  ref
) {
  const snapPoints = useMemo(() => ["50%"], []);

  // REACTIVE SUBSCRIPTIONS: Subscribe directly to each value from the store
  // This ensures the component re-renders when payment updates these values
  const activeOrderSubtotal = useOrderStore(
    (state) => state.activeOrderSubtotal
  );
  const activeOrderTax = useOrderStore((state) => state.activeOrderTax);
  const activeOrderTotal = useOrderStore((state) => state.activeOrderTotal);
  const activeOrderDiscount = useOrderStore(
    (state) => state.activeOrderDiscount
  );
  const activeOrderOutstandingTotal = useOrderStore(
    (state) => state.activeOrderOutstandingTotal
  );
  const activeOrderOutstandingSubtotal = useOrderStore(
    (state) => state.activeOrderOutstandingSubtotal
  );
  const activeOrderOutstandingTax = useOrderStore(
    (state) => state.activeOrderOutstandingTax
  );

  // Get the active order directly with a selector
  const activeOrder = useOrderStore((state) => {
    if (state.activeOrderId) {
      return state.ordersById[state.activeOrderId];
    }
    return undefined;
  });

  // Use prop if provided, otherwise fall back to store value
  const hasPayments =
    hasPaymentsProp ?? (activeOrder?.payments?.length ?? 0) > 0;

  const PaidAmount =  activeOrder?.payments?.reduce((acc, payment) => acc + payment.amount, 0)

  // When there are payments, always show simplified view
  // We can't reliably break down subtotal/tax after partial payments due to store sync issues
  const showSimplifiedView = hasPayments;
  
  // Calculate display amounts - NO useMemo to avoid stale cached values
  // Show outstanding if partially paid, otherwise full totals
  let displaySubtotal: number;
  if (showSimplifiedView) {
    // When we have backend amount_due, use the prop value (tax included)
    displaySubtotal = totalDisplayAmount;
  } else if (hasPayments) {
    displaySubtotal = activeOrderOutstandingSubtotal;
  } else {
    displaySubtotal = activeOrderSubtotal;
  }

  let displayTax: number;
  if (showSimplifiedView) {
    // Tax is included in backend amount_due, don't show separately
    displayTax = 0;
  } else if (hasPayments) {
    displayTax = activeOrderOutstandingTax;
  } else {
    displayTax = activeOrderTax;
  }

  // USE THE PROP DIRECTLY - this is the source of truth from the parent
  // which has the correct value (shown on the Pay button)
  const displayTotal = totalDisplayAmount;

  // Only show discount if not partially paid (discount already applied to paid items)
  const displayDiscount = hasPayments ? 0 : activeOrderDiscount;

  const voucher = 0; // No voucher logic in the store

  const renderBackdrop = useMemo(
    () => (props: any) =>
      (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.7}
        />
      ),
    []
  );

  return (
    <BottomSheet
      ref={ref}
      index={-1} // Start closed
      snapPoints={snapPoints}
      enablePanDownToClose={true}
      onClose={onClose}
      handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: "#212121" }}
    >
      <BottomSheetView className="flex-1 bg-[#212121] rounded-t-3xl overflow-hidden">
        <View className="flex-row justify-between items-center p-4 border-b border-gray-700">
          <Text className="text-2xl font-bold text-white">
            Pricing Breakdown
          </Text>
          <TouchableOpacity
            onPress={onClose}
            className="p-2 bg-[#303030] rounded-full border border-gray-600"
          >
            <X color="#9CA3AF" size={20} />
          </TouchableOpacity>
        </View>
        <View className="p-4 flex-1">
          {/* Show simplified view when backend provides amount_due (tax included) */}
          {/* {showSimplifiedView ? (
            <>
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-gray-400 text-base">
                  Tax included in balance 
                </Text>
                <Text className="text-gray-400 text-base">${activeOrderOutstandingTax.toFixed(2)}</Text>
              </View>
              <View className="h-[1px] bg-gray-700 my-3" />
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-white text-xl font-bold">
                  Balance Due:
                </Text>
                <Text className="text-xl font-bold text-yellow-400">
                  ${displayTotal.toFixed(2)}
                </Text>
              </View>
            </>
          ) : ( */}
            
              {/* Full breakdown */}
              {
                  hasPayments && (
                    <View className="flex-row justify-between items-center border-b border-gray-700 pb-2">
                      <Text className="text-white text-base">Paid Amount:</Text>
                      <Text className="text-white text-base">${PaidAmount?.toFixed(2)}</Text>
                    </View>
                  )
                }
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-white text-lg">
                  {hasPayments ? "Unpaid Subtotal:" : "Subtotal:"}
                </Text>
                <Text className="text-white text-lg">
                  ${activeOrderOutstandingSubtotal.toFixed(2)}
                </Text>
              </View>
              {displayDiscount > 0 && (
                <View className="flex-row justify-between items-center py-2">
                  <Text className="text-white text-lg">Discount:</Text>
                  <Text className="text-white text-lg">
                    -${displayDiscount.toFixed(2)}
                  </Text>
                </View>
              )}
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-white text-lg">
                  {hasPayments ? "Unpaid Tax:" : "Tax:"}
                </Text>
                <Text className="text-white text-lg">
                  ${activeOrderOutstandingTax.toFixed(2)}
                </Text>
              </View>
              {voucher > 0 && (
                <View className="flex-row justify-between items-center py-2">
                  <Text className="text-white text-lg">Voucher:</Text>
                  <Text className="text-white text-lg">
                    -${voucher.toFixed(2)}
                  </Text>
                </View>
              )}
              <View className="h-[1px] bg-gray-700 my-3" />
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-white text-xl font-bold">
                  {hasPayments ? "Balance Due:" : "Total:"}
                </Text>
                <Text
                  className={`text-xl font-bold ${
                    hasPayments ? "text-yellow-400" : "text-white"
                  }`}
                >
                  ${displayTotal.toFixed(2)}
                </Text>
              </View>
            
        

          <TouchableOpacity
            onPress={onPressProceedToPayment}
            className="mt-6 p-3 bg-blue-500 rounded-lg items-center"
          >
            <Text className="text-white text-lg font-semibold">
              Proceed to Payment
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
};

const PricingBreakdownSheet = forwardRef(PricingBreakdownSheetComponent);
PricingBreakdownSheet.displayName = "PricingBreakdownSheet";

export default PricingBreakdownSheet;
