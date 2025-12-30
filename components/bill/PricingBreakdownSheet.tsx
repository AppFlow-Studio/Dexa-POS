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
}

const PricingBreakdownSheetComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  PricingBreakdownSheetProps
> = function PricingBreakdownSheetComponent(
  { onClose, onPressProceedToPayment },
  ref
) {
  const snapPoints = useMemo(() => ["50%"], []);

  // Get values directly from the order store
  const {
    activeOrderSubtotal,
    activeOrderTax,
    activeOrderTotal,
    activeOrderDiscount,
    activeOrderOutstandingTotal,
    activeOrderOutstandingSubtotal,
    activeOrderOutstandingTax,
    activeOrderId,
    ordersById,
  } = useOrderStore();

  // Get the active order to check for amount_due and payments
  const activeOrder = activeOrderId ? ordersById[activeOrderId] : undefined;

  // Determine if this is a partially paid order
  const hasPayments = (activeOrder?.payments?.length ?? 0) > 0;
  const hasBackendAmountDue =
    activeOrder?.amount_due !== undefined && activeOrder.amount_due >= 0;

  // When backend provides amount_due, we can't break down subtotal/tax separately
  // because the backend amount_due already includes everything.
  // In this case, we show simplified view with just Balance Due.
  const showSimplifiedView = hasBackendAmountDue && hasPayments;

  // Calculate display amounts - show outstanding if partially paid, otherwise full totals
  const displaySubtotal = useMemo(() => {
    if (showSimplifiedView) {
      // When we have backend amount_due, we don't have separate subtotal
      // Just return the amount_due as a single value (tax included)
      return activeOrder!.amount_due!;
    }
    if (hasPayments) {
      return activeOrderOutstandingSubtotal;
    }
    return activeOrderSubtotal;
  }, [
    showSimplifiedView,
    hasPayments,
    activeOrder?.amount_due,
    activeOrderOutstandingSubtotal,
    activeOrderSubtotal,
  ]);

  const displayTax = useMemo(() => {
    if (showSimplifiedView) {
      // Tax is included in backend amount_due, don't show separately
      return 0;
    }
    if (hasPayments) {
      return activeOrderOutstandingTax;
    }
    return activeOrderTax;
  }, [
    showSimplifiedView,
    hasPayments,
    activeOrderOutstandingTax,
    activeOrderTax,
  ]);

  const displayTotal = useMemo(() => {
    // Priority: backend amount_due > calculated outstanding > full total
    if (hasBackendAmountDue) {
      return activeOrder!.amount_due!;
    }
    if (hasPayments && activeOrderOutstandingTotal > 0) {
      return activeOrderOutstandingTotal;
    }
    return activeOrderTotal;
  }, [
    hasBackendAmountDue,
    hasPayments,
    activeOrder?.amount_due,
    activeOrderOutstandingTotal,
    activeOrderTotal,
  ]);

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
          {showSimplifiedView ? (
            <>
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-gray-400 text-base">
                  Tax included in balance
                </Text>
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
          ) : (
            <>
              {/* Full breakdown when no backend amount_due */}
              <View className="flex-row justify-between items-center py-2">
                <Text className="text-white text-lg">
                  {hasPayments ? "Unpaid Subtotal:" : "Subtotal:"}
                </Text>
                <Text className="text-white text-lg">
                  ${displaySubtotal.toFixed(2)}
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
                  ${displayTax.toFixed(2)}
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
            </>
          )}

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
