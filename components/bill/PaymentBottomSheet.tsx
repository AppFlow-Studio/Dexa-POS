import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { X } from "lucide-react-native";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import BillSummary from "./BillSummary";
import Totals from "./Totals";

interface PaymentBottomSheetProps {
  onClose: () => void;
}

const PaymentBottomSheet = React.forwardRef<
  BottomSheet,
  PaymentBottomSheetProps
>(({ onClose }, ref) => {
  const snapPoints = useMemo(() => ["75%"], []);

  // Custom backdrop component
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
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose={true}
      onClose={onClose}
      handleComponent={null}
      backgroundStyle={{ backgroundColor: "#ffffff" }}
      activeOffsetY={[-10, 10]}
      backdropComponent={renderBackdrop}
    >
      <BottomSheetView className="flex-1">
        {/* Top Dark Header */}
        <View
          className="bg-gray-900 rounded-t-2xl p-6"
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={onClose}
            className="absolute top-6 right-6 bg-gray-700 p-2 rounded-full z-50"
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          >
            <X color="#9ca3af" size={20} />
          </TouchableOpacity>
          <Text className="text-white text-2xl font-bold">Card Payment</Text>
          <Text className="text-gray-300 text-base mt-1">
            Please use payment terminal
          </Text>
          <Text className="text-gray-400 text-sm mt-3">Purchase in Card</Text>
        </View>

        {/* White Content Area */}
        <View className="flex-1 bg-white p-6">
          <BillSummary />
          <Totals />

          {/* Payment Status section */}
          <View className="flex-row justify-between items-center my-4">
            <Text className="text-base text-gray-600">Payment Status</Text>
            <View className="px-3 py-1 bg-gray-200 rounded-full">
              <Text className="font-semibold text-gray-600">Processing...</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View className="mt-auto pt-4 border-t border-gray-200 flex-row space-x-3 gap-4">
            <TouchableOpacity
              onPress={onClose}
              className="flex-1 py-4 bg-white border border-gray-300 rounded-xl items-center"
            >
              <Text className="text-gray-800 font-bold text-base">Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClose}
              className="flex-1 py-4 bg-blue-500 rounded-xl items-center"
            >
              <Text className="text-white font-bold text-base">
                Confirm Payment
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
});

export default PaymentBottomSheet;
