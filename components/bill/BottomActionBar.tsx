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
  onPressDiscount: () => void;
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
  // Shared styling: flex-1 ensures they all take equal width
  const buttonBaseClass =
    "flex-1 flex-row items-center justify-center h-12 px-2 rounded-lg gap-2";

  const renderDefaultButtons = () => (
    <>
      {/* Discount Button: Indigo (Distinct from Blue, fits dark theme) */}
      <TouchableOpacity
        onPress={onPressDiscount}
        className={`${buttonBaseClass} bg-indigo-600`}
        activeOpacity={0.7}
      >
        <Percent size={18} color="white" />
        <Text className="font-semibold text-white text-base">Discount</Text>
      </TouchableOpacity>

      {/* Total Button: Blue (Primary Action) or Green (Paid) */}
      {(() => {
        // Only show "Paid" if order has items AND balance is zero
        const hasItems = (activeOrder?.items?.length ?? 0) > 0;
        const isFullyPaid = hasItems && totalDisplayAmount <= 0;
        // console.log('[totalDisplayAmount] totalDisplayAmount', totalDisplayAmount);
        return (
          <TouchableOpacity
            onPress={onPressTotal}
            className={`${buttonBaseClass} ${
              isFullyPaid ? "bg-emerald-600" : "bg-blue-600"
            }`}
            activeOpacity={0.7}
            disabled={isFullyPaid}
          >
            {/* Truncate text if it gets too long on small screens */}
            <Text
              className="font-semibold text-white text-base"
              numberOfLines={1}
            >
              {isFullyPaid ? "Paid" : `$${totalDisplayAmount.toFixed(2)}`}
            </Text>
            {!isFullyPaid && <CreditCard size={18} color="white" />}
          </TouchableOpacity>
        );
      })()}
    </>
  );

  const renderPaidButtons = () => (
    <>
      {/* Close Check: Emerald Green (Success/Finish) */}
      <TouchableOpacity
        onPress={onPressCloseCheck}
        className={`${buttonBaseClass} bg-emerald-600`}
        activeOpacity={0.7}
      >
        <CheckCircle size={18} color="white" />
        <Text className="font-semibold text-white text-base">Close</Text>
      </TouchableOpacity>

      {/* Clear Table: Red (Destructive) */}
      <TouchableOpacity
        onPress={onPressClearTable}
        className={`${buttonBaseClass} bg-red-900/40 border border-red-500`}
        activeOpacity={0.7}
      >
        <Trash2 size={18} color="#fca5a5" />
        <Text className="font-semibold text-red-100 text-base">Clear</Text>
      </TouchableOpacity>
    </>
  );

  const renderClosedButtons = () => (
    <>
      {/* Reopen: Amber (Undo/Correction) */}
      <TouchableOpacity
        onPress={onPressReopenCheck}
        className={`${buttonBaseClass} bg-amber-600`}
        activeOpacity={0.7}
      >
        <RotateCcw size={18} color="white" />
        <Text className="font-semibold text-white text-base">Reopen</Text>
      </TouchableOpacity>

      {/* Clear Table: Red */}
      <TouchableOpacity
        onPress={onPressClearTable}
        className={`${buttonBaseClass} bg-red-900/40 border border-red-500`}
        activeOpacity={0.7}
      >
        <Trash2 size={18} color="#fca5a5" />
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
    // Container: Removed "justify-between", added "gap-3"
    <View className="flex-row items-center py-4 px-4 bg-[#303030] border-t border-gray-700 gap-3">
      {/* More Button: Now has text and uses flex-1 */}
      <TouchableOpacity
        onPress={onPressMore}
        className={`${buttonBaseClass} bg-[#212121] border border-gray-600`}
        activeOpacity={0.7}
      >
        <MoreHorizontal size={20} color="white" />
        <Text className="font-semibold text-white text-base">More</Text>
      </TouchableOpacity>

      {/* Dynamic Buttons (Discount/Total or Close/Clear) */}
      {renderButtons()}
    </View>
  );
};

export default BottomActionBar;
