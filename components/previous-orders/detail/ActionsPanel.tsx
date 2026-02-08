import { PreviousOrder } from "@/lib/types";
import {
  CreditCard,
  FileText,
  Printer,
  RefreshCcw,
  RotateCcw,
  ShoppingCart,
} from "lucide-react-native";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ActionsPanelProps {
  order: PreviousOrder;
  onRefund: () => void;
  onTipAdjust: () => void;
  onPrint: () => void;
  onReopen: () => void;
  onAddToBill: () => void;
  onNotes: () => void;
}

const ActionsPanel: React.FC<ActionsPanelProps> = ({
  order,
  onRefund,
  onTipAdjust,
  onPrint,
  onReopen,
  onAddToBill,
  onNotes,
}) => {
  const canRefund = useMemo(() => {
    if (order.paymentStatus === "Refunded") return false;
    if (order.paymentStatus === "Partially Refunded") {
      const refundableItems = order.items.filter(
        (item) => (item.refundedQuantity || 0) < item.quantity,
      );
      if (refundableItems.length === 0) return false;
    }
    return (
      order.paymentStatus === "Paid" ||
      order.paymentStatus === "Partially Refunded"
    );
  }, [order]);

  const hasCardPayments = useMemo(() => {
    if (!order.payments) return false;
    return order.payments.some((p) => p.method !== "Cash" && !p.isVoided);
  }, [order.payments]);

  const isClosed = order.checkStatus === "Closed";

  return (
    <View className="mt-4 gap-2.5">
      {/* Print Receipt - always visible */}
      <ActionButton
        icon={<Printer color="#FFFFFF" size={18} />}
        label="Print Receipt"
        onPress={onPrint}
        variant="primary"
      />

      {/* Refund */}
      {canRefund && (
        <ActionButton
          icon={<RotateCcw color="#EF4444" size={18} />}
          label="Refund"
          onPress={onRefund}
          variant="danger"
        />
      )}

      {/* Tip Adjust */}
      {hasCardPayments && (
        <ActionButton
          icon={<CreditCard color="#8B5CF6" size={18} />}
          label="Tip Adjust"
          onPress={onTipAdjust}
          variant="purple"
        />
      )}

      {/* Re-open Order */}
      {isClosed && (
        <ActionButton
          icon={<RefreshCcw color="#F59E0B" size={18} />}
          label="Re-open Order"
          onPress={onReopen}
          variant="warning"
        />
      )}

      {/* Add to Current Bill */}
      <ActionButton
        icon={<ShoppingCart color="#9CA3AF" size={18} />}
        label="Add to Current Bill"
        onPress={onAddToBill}
        variant="default"
      />

      {/* Order Notes */}
      {order.notes && (
        <ActionButton
          icon={<FileText color="#9CA3AF" size={18} />}
          label="Order Notes"
          onPress={onNotes}
          variant="default"
        />
      )}
    </View>
  );
};

const variantStyles: Record<string, { border: string; bg: string }> = {
  primary: { border: "border-blue-500", bg: "bg-blue-600" },
  danger: { border: "border-red-500", bg: "bg-red-900/30" },
  purple: { border: "border-purple-500", bg: "bg-purple-900/30" },
  warning: { border: "border-yellow-500", bg: "bg-yellow-900/30" },
  default: { border: "border-gray-600", bg: "bg-[#303030]" },
};

const ActionButton = ({
  icon,
  label,
  onPress,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  variant: keyof typeof variantStyles;
}) => {
  const style = variantStyles[variant];
  const isPrimary = variant === "primary";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`flex-row items-center justify-center gap-2 py-3 rounded-xl border ${style.border} ${style.bg}`}
    >
      {icon}
      <Text
        className={`text-base font-bold ${isPrimary ? "text-white" : "text-gray-300"}`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

export default React.memo(ActionsPanel);
