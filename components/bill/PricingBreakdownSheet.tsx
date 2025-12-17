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
  } = useOrderStore();

  const voucher = 0; // No voucher logic in the store

  const renderBackdrop = useMemo(
    () => (props: any) => (
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
          <View className="flex-row justify-between items-center py-2">
            <Text className="text-white text-lg">Subtotal:</Text>
            <Text className="text-white text-lg">
              ${activeOrderSubtotal.toFixed(2)}
            </Text>
          </View>
          <View className="flex-row justify-between items-center py-2">
            <Text className="text-white text-lg">Discount:</Text>
            <Text className="text-white text-lg">
              -${activeOrderDiscount.toFixed(2)}
            </Text>
          </View>
          <View className="flex-row justify-between items-center py-2">
            <Text className="text-white text-lg">Tax:</Text>
            <Text className="text-white text-lg">
              ${activeOrderTax.toFixed(2)}
            </Text>
          </View>
          <View className="flex-row justify-between items-center py-2">
            <Text className="text-white text-lg">Voucher:</Text>
            <Text className="text-white text-lg">-${voucher.toFixed(2)}</Text>
          </View>
          <View className="h-[1px] bg-gray-700 my-3" />
          <View className="flex-row justify-between items-center py-2">
            <Text className="text-white text-xl font-bold">Total:</Text>
            <Text className="text-white text-xl font-bold">
              ${activeOrderTotal.toFixed(2)}
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
