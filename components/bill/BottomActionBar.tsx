import { OrderProfile } from "@/lib/types";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface BottomActionBarProps {
  activeOrder: OrderProfile | undefined;
  onPressMore: () => void;
  onPressTotal: () => void;
  onPressReopenCheck: () => void;
  onPressCloseCheck: () => void;
  onPressClearTable: () => void;
  totalDisplayAmount: number;
}

const BottomActionBar: React.FC<BottomActionBarProps> = ({
  activeOrder,
  onPressMore,
  onPressTotal,
  onPressReopenCheck,
  onPressCloseCheck,
  onPressClearTable,
  totalDisplayAmount,
}) => {
  const renderDefaultButtons = () => (
    <>
      <TouchableOpacity
        onPress={onPressTotal}
        // Reduced padding and text size
        className="px-4 py-2 rounded-md bg-blue-500 flex-row items-center gap-2"
      >
        <Text className="font-semibold text-white text-base">
          Total: ${totalDisplayAmount.toFixed(2)}
        </Text>
        <Text className="text-white text-base">💳</Text>
      </TouchableOpacity>
    </>
  );

  const renderPaidButtons = () => (
    <>
      <TouchableOpacity
        onPress={onPressCloseCheck}
        // Reduced padding and text size
        className="px-4 py-2 rounded-md bg-blue-500"
      >
        <Text className="font-semibold text-white text-sm">Close Check</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onPressClearTable}
        // Reduced padding and text size
        className="px-4 py-2 rounded-md border border-red-500 bg-red-600"
      >
        <Text className="font-semibold text-red-100 text-sm">Clear Table</Text>
      </TouchableOpacity>
    </>
  );

  const renderClosedButtons = () => (
    <>
      <TouchableOpacity
        onPress={onPressReopenCheck}
        // Reduced padding and text size
        className="px-4 py-2 rounded-md bg-blue-500"
      >
        <Text className="font-semibold text-white text-sm">Reopen Check</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onPressClearTable}
        // Reduced padding and text size
        className="px-4 py-2 rounded-md border border-red-500 bg-red-600"
      >
        <Text className="font-semibold text-red-100 text-sm">Clear Table</Text>
      </TouchableOpacity>
    </>
  );

  const renderButtons = () => {
    if (!activeOrder) {
      return renderDefaultButtons();
    }
    if (activeOrder.check_status === "Closed") {
      return renderClosedButtons();
    }
    if (activeOrder.paid_status === "Paid") {
      return renderPaidButtons();
    }
    return renderDefaultButtons();
  };

  return (
    // Reduced container padding from p-3 to p-2
    <View className="flex-row justify-between items-center p-2 bg-[#303030] border-t border-gray-700">
      {/* More button made smaller */}
      <TouchableOpacity
        onPress={onPressMore}
        className="px-4 py-2 rounded-md border border-gray-600 bg-[#212121]"
      >
        <Text className="font-semibold text-white text-sm">More (⋯)</Text>
      </TouchableOpacity>

      {/* Render other buttons grouped on the right */}
      <View className="flex-row items-center gap-2">{renderButtons()}</View>
    </View>
  );
};

export default BottomActionBar;
