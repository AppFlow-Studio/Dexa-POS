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
  totalDisplayAmount: number; // Added new prop
}

const BottomActionBar: React.FC<BottomActionBarProps> = ({
  activeOrder,
  onPressMore,
  onPressTotal,
  onPressReopenCheck,
  onPressCloseCheck,
  onPressClearTable,
  totalDisplayAmount, // Destructure new prop
}) => {
  // Removed internal totalAmount calculation

  const renderDefaultButtons = () => (
    <>
      <TouchableOpacity
        onPress={onPressTotal}
        className="px-6 py-3 rounded-lg bg-blue-500 flex-row items-center gap-2"
      >
        <Text className="font-semibold text-white text-lg">Total: ${totalDisplayAmount.toFixed(2)}</Text>
        <Text className="text-white text-lg">💳</Text>
      </TouchableOpacity>
    </>
  );

  const renderPaidButtons = () => (
    <>
      <TouchableOpacity
        onPress={onPressCloseCheck}
        className="px-6 py-2 rounded-lg bg-blue-500"
      >
        <Text className="font-semibold text-white text-base">Close Check</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onPressClearTable}
        className="px-6 py-2 rounded-lg border border-red-500 bg-red-600"
      >
        <Text className="font-semibold text-red-100 text-base">
          Clear Table
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderClosedButtons = () => (
    <>
      <TouchableOpacity
        onPress={onPressReopenCheck}
        className="px-6 py-2 rounded-lg bg-blue-500"
      >
        <Text className="font-semibold text-white text-base">Reopen Check</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onPressClearTable}
        className="px-6 py-2 rounded-lg border border-red-500 bg-red-600"
      >
        <Text className="font-semibold text-red-100 text-base">
          Clear Table
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderButtons = () => {
    if (!activeOrder) {
      // If there is no active order, we should probably not show anything or show a disabled state.
      // For now, returning default which will show Total: $0.00
      return renderDefaultButtons();
    }
    if (activeOrder.check_status === 'Closed') {
      return renderClosedButtons();
    }
    if (activeOrder.paid_status === 'Paid') {
      return renderPaidButtons();
    }
    return renderDefaultButtons();
  };

  return (
    <View className="flex-row justify-between items-center p-3 bg-[#303030] border-t border-gray-700">
      {/* Always render the More button on the left */}
      <TouchableOpacity
        onPress={onPressMore}
        className="px-6 py-3 rounded-lg border border-gray-600 bg-[#212121]"
      >
        <Text className="font-semibold text-white text-lg">More (⋯)</Text>
      </TouchableOpacity>

      {/* Render other buttons grouped on the right */}
      <View className="flex-row items-center gap-2">
        {renderButtons()}
      </View>
    </View>
  );
};

export default BottomActionBar;
