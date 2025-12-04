import { OrderProfile } from "@/lib/types";
import {
  CheckCircle,
  CreditCard,
  MoreHorizontal,
  Percent,
  RotateCcw,
  Trash2,
} from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface BottomActionBarProps {
  activeOrder: OrderProfile | undefined;
  onPressMore: () => void;
  onPressTotal: () => void;
  onPressReopenCheck: () => void;
  onPressCloseCheck: () => void;
  onPressClearTable: () => void;
  onPressDiscount: () => void; // New Prop
  totalDisplayAmount: number;
}

const BottomActionBar: React.FC<BottomActionBarProps> = ({
  activeOrder,
  onPressMore,
  onPressTotal,
  onPressReopenCheck,
  onPressCloseCheck,
  onPressClearTable,
  onPressDiscount,
  totalDisplayAmount,
}) => {
  // Shared styling for consistent height and alignment
  const buttonBaseClass =
    "flex-row items-center justify-center h-12 px-4 rounded-lg gap-2";

  const renderDefaultButtons = () => (
    <>
      {/* Discount Button (New) */}
      <TouchableOpacity
        onPress={onPressDiscount}
        className={`${buttonBaseClass} bg-[#212121] border border-gray-600`}
        activeOpacity={0.7}
      >
        <Percent size={20} color="white" />
        <Text className="font-semibold text-white text-base">Discount</Text>
      </TouchableOpacity>

      {/* Total Button */}
      <TouchableOpacity
        onPress={onPressTotal}
        className={`${buttonBaseClass} bg-blue-600`}
        activeOpacity={0.7}
      >
        <Text className="font-semibold text-white text-base">
          Total: ${totalDisplayAmount.toFixed(2)}
        </Text>
        <CreditCard size={20} color="white" />
      </TouchableOpacity>
    </>
  );

  const renderPaidButtons = () => (
    <>
      <TouchableOpacity
        onPress={onPressCloseCheck}
        className={`${buttonBaseClass} bg-blue-600`}
        activeOpacity={0.7}
      >
        <CheckCircle size={20} color="white" />
        <Text className="font-semibold text-white text-base">Close Check</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onPressClearTable}
        className={`${buttonBaseClass} bg-red-600/20 border border-red-500`}
        activeOpacity={0.7}
      >
        <Trash2 size={20} color="#fca5a5" />
        <Text className="font-semibold text-red-100 text-base">Clear</Text>
      </TouchableOpacity>
    </>
  );

  const renderClosedButtons = () => (
    <>
      <TouchableOpacity
        onPress={onPressReopenCheck}
        className={`${buttonBaseClass} bg-blue-600`}
        activeOpacity={0.7}
      >
        <RotateCcw size={20} color="white" />
        <Text className="font-semibold text-white text-base">Reopen</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onPressClearTable}
        className={`${buttonBaseClass} bg-red-600/20 border border-red-500`}
        activeOpacity={0.7}
      >
        <Trash2 size={20} color="#fca5a5" />
        <Text className="font-semibold text-red-100 text-base">Clear</Text>
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
    // Updated Container: increased vertical padding (py-4) for centering and breathing room
    <View className="flex-row justify-between items-center py-4 px-4 bg-[#303030] border-t border-gray-700">
      {/* More Button: Left Side */}
      <TouchableOpacity
        onPress={onPressMore}
        className={`${buttonBaseClass} bg-[#212121] border border-gray-600 w-12 px-0`} // Fixed width for square-ish icon button logic, or remove w-12 for text
        activeOpacity={0.7}
      >
        <MoreHorizontal size={24} color="white" />
      </TouchableOpacity>

      {/* Action Group: Right Side (Discount + Total) */}
      <View className="flex-row items-center gap-3">{renderButtons()}</View>
    </View>
  );
};

export default BottomActionBar;
