import { OrderProfile } from "@/lib/types";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import {
  CheckCircle,
  CreditCard,
  FileText,
  Printer,
  RefreshCcw,
  RotateCcw,
  XCircle,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

interface ActionsPanelProps {
  order: OrderProfile;
  onRefund: () => void;
  onTipAdjust: () => void;
  onPrint: () => void;
  onReopen: () => void;
  onCloseCheck: () => void;
  onVoidOrder: () => void;
  onNotes: () => void;
  isClosingCheck?: boolean;
  isReopeningCheck?: boolean;
  isVoiding?: boolean;
}

const ActionsPanel: React.FC<ActionsPanelProps> = ({
  order,
  onRefund,
  onTipAdjust,
  onPrint,
  onReopen,
  onCloseCheck,
  onVoidOrder,
  onNotes,
  isClosingCheck = false,
  isReopeningCheck = false,
  isVoiding = false,
}) => {
  const [confirmAction, setConfirmAction] = useState<"void" | "close" | null>(null);

  const canRefund = useMemo(() => {
    if (order.order_status === "refunded") return false;
    const totalRefunded = (order.payments || []).reduce(
      (sum, p) => sum + (p.refundedAmount ?? 0),
      0,
    );
    if (totalRefunded > 0 && totalRefunded >= (order.total_amount || 0)) return false;
    return order.paid_status === "Paid" || order.paid_status === "Partial";
  }, [order]);

  const hasCardPayments = useMemo(() => {
    if (!order.payments) return false;
    return order.payments.some((p) => p.method !== "Cash" && !p.isVoided);
  }, [order.payments]);

  const isClosed = order.check_status === "Closed";
  const canCloseCheck =
    order.paid_status === "Paid" && order.check_status !== "Closed";
  const isVoided = order.order_status === "void";
  const anyLoading = isClosingCheck || isReopeningCheck || isVoiding;

  return (
    <View className="mt-4 gap-2.5">
      {/* Print Receipt - always visible */}
      <ActionButton
        icon={<Printer color="#FFFFFF" size={18} />}
        label="Print Receipt"
        onPress={onPrint}
        variant="primary"
        disabled={anyLoading}
      />

      {/* Refund */}
      {canRefund && (
        <ActionButton
          icon={<RotateCcw color="#EF4444" size={18} />}
          label="Refund"
          onPress={onRefund}
          variant="danger"
          disabled={anyLoading}
        />
      )}

      {/* Tip Adjust */}
      {hasCardPayments && (
        <ActionButton
          icon={<CreditCard color="#8B5CF6" size={18} />}
          label="Tip Adjust"
          onPress={onTipAdjust}
          variant="purple"
          disabled={anyLoading}
        />
      )}

      {/* Close Check */}
      {canCloseCheck && (
        <ActionButton
          icon={
            isClosingCheck ? (
              <ActivityIndicator size="small" color="#4ade80" />
            ) : (
              <CheckCircle color="#4ade80" size={18} />
            )
          }
          label={isClosingCheck ? "Closing..." : "Close Check"}
          onPress={() => setConfirmAction("close")}
          variant="success"
          disabled={anyLoading}
        />
      )}

      {/* Re-open Order */}
      {isClosed && (
        <ActionButton
          icon={
            isReopeningCheck ? (
              <ActivityIndicator size="small" color="#F59E0B" />
            ) : (
              <RefreshCcw color="#F59E0B" size={18} />
            )
          }
          label={isReopeningCheck ? "Reopening..." : "Re-open Order"}
          onPress={onReopen}
          variant="warning"
          disabled={anyLoading}
        />
      )}

      {/* Order Notes */}
      {order.notes && (
        <ActionButton
          icon={<FileText color="#9CA3AF" size={18} />}
          label="Order Notes"
          onPress={onNotes}
          variant="default"
          disabled={anyLoading}
        />
      )}

      {/* Void Order */}
      {!isVoided && (
        <ActionButton
          icon={
            isVoiding ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <XCircle color="#EF4444" size={18} />
            )
          }
          label={isVoiding ? "Voiding..." : "Void Order"}
          onPress={() => setConfirmAction("void")}
          variant="danger"
          disabled={anyLoading}
        />
      )}

      {/* Confirmation Modals */}
      <ConfirmationModal
        isOpen={confirmAction === "void"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          setConfirmAction(null);
          onVoidOrder();
        }}
        title="Void Order"
        description="This will void the entire order including all items and payments. This action cannot be undone."
        confirmText="Void Order"
        variant="destructive"
      />

      <ConfirmationModal
        isOpen={confirmAction === "close"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          setConfirmAction(null);
          onCloseCheck();
        }}
        title="Close Check"
        description="This will close the check for this order. The order will be marked as finalized."
        confirmText="Close Check"
        variant="destructive"
      />
    </View>
  );
};

const variantStyles: Record<string, { border: string; bg: string }> = {
  primary: { border: "border-blue-500", bg: "bg-blue-600" },
  danger: { border: "border-red-500", bg: "bg-red-900/30" },
  purple: { border: "border-purple-500", bg: "bg-purple-900/30" },
  warning: { border: "border-yellow-500", bg: "bg-yellow-900/30" },
  success: { border: "border-green-500", bg: "bg-green-900/30" },
  default: { border: "border-gray-600", bg: "bg-[#303030]" },
};

const ActionButton = ({
  icon,
  label,
  onPress,
  variant,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  variant: keyof typeof variantStyles;
  disabled?: boolean;
}) => {
  const style = variantStyles[variant];
  const isPrimary = variant === "primary";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
      className={`flex-row items-center justify-center gap-2 py-3 rounded-xl border ${style.border} ${style.bg} ${disabled ? "opacity-50" : ""}`}
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
