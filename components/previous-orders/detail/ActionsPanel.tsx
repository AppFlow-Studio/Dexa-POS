import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { derivePaymentRefundState } from "@/lib/paymentStatus";
import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import {
  CheckCircle,
  CreditCard,
  FileText,
  LogIn,
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
  onClaim: () => void;
  isClosingCheck?: boolean;
  isReopeningCheck?: boolean;
  isVoiding?: boolean;
  isClaiming?: boolean;
  isForeign?: boolean;
  ownerLabel?: string;
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
  onClaim,
  isClosingCheck = false,
  isReopeningCheck = false,
  isVoiding = false,
  isClaiming = false,
  isForeign = false,
  ownerLabel,
}) => {
  const [confirmAction, setConfirmAction] = useState<
    "void" | "close" | "claim" | null
  >(null);

  const canRefund = useMemo(() => {
    if (order.order_status === "refunded") return false;
    if (derivePaymentRefundState(order.payments).isFullyRefunded) return false;
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
  const anyLoading =
    isClosingCheck || isReopeningCheck || isVoiding || isClaiming;

  return (
    <View style={{ marginTop: 16, gap: 10 }}>
      {/* Take Over Order — only when foreign-owned */}
      {isForeign && (
        <ActionButton
          icon={
            isClaiming ? (
              <ActivityIndicator size="small" color={colors.teal} />
            ) : (
              <LogIn color={colors.teal} size={18} />
            )
          }
          label={isClaiming ? "Taking over…" : "Take Over Order"}
          onPress={() => setConfirmAction("claim")}
          variant="teal"
          disabled={anyLoading}
        />
      )}

      {/* Print Receipt - always visible */}
      <ActionButton
        icon={<Printer color={colors.onSolid} size={18} />}
        label="Print Receipt"
        onPress={onPrint}
        variant="primary"
        disabled={anyLoading}
      />

      {/* Refund */}
      {canRefund && (
        <ActionButton
          icon={<RotateCcw color={colors.danger} size={18} />}
          label="Refund"
          onPress={onRefund}
          variant="danger"
          disabled={anyLoading}
        />
      )}

      {/* Tip Adjust */}
      {hasCardPayments && (
        <ActionButton
          icon={<CreditCard color={colors.teal} size={18} />}
          label="Tip Adjust"
          onPress={onTipAdjust}
          variant="teal"
          disabled={anyLoading}
        />
      )}

      {/* Close Check */}
      {canCloseCheck && (
        <ActionButton
          icon={
            isClosingCheck ? (
              <ActivityIndicator size="small" color={colors.teal} />
            ) : (
              <CheckCircle color={colors.teal} size={18} />
            )
          }
          label={isClosingCheck ? "Closing..." : "Close Check"}
          onPress={() => setConfirmAction("close")}
          variant="teal"
          disabled={anyLoading}
        />
      )}

      {/* Re-open Order */}
      {isClosed && (
        <ActionButton
          icon={
            isReopeningCheck ? (
              <ActivityIndicator size="small" color={colors.teal} />
            ) : (
              <RefreshCcw color={colors.teal} size={18} />
            )
          }
          label={isReopeningCheck ? "Reopening..." : "Re-open Order"}
          onPress={onReopen}
          variant="teal"
          disabled={anyLoading}
        />
      )}

      {/* Order Notes */}
      {order.notes && (
        <ActionButton
          icon={<FileText color={colors.teal} size={18} />}
          label="Order Notes"
          onPress={onNotes}
          variant="teal"
          disabled={anyLoading}
        />
      )}

      {/* Void Order */}
      {!isVoided && (
        <ActionButton
          icon={
            isVoiding ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <XCircle color={colors.danger} size={18} />
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

      <ConfirmationModal
        isOpen={confirmAction === "claim"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          setConfirmAction(null);
          onClaim();
        }}
        title="Take Over Order"
        description={`This will transfer ownership to your station${
          ownerLabel ? ` (currently ${ownerLabel})` : ""
        }. The other station will switch to read-only.`}
        confirmText="Take Over"
        variant="destructive"
      />
    </View>
  );
};

type ButtonVariant = "primary" | "danger" | "teal";

const variantStyleMap: Record<
  ButtonVariant,
  { backgroundColor: string; borderColor: string }
> = {
  primary: { backgroundColor: colors.teal, borderColor: colors.teal },
  danger: {
    backgroundColor: colors.danger + "15",
    borderColor: colors.danger + "40",
  },
  teal: {
    backgroundColor: colors.teal + "15",
    borderColor: colors.teal + "40",
  },
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
  variant: ButtonVariant;
  disabled?: boolean;
}) => {
  const variantStyle = variantStyleMap[variant];
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 10,
          borderWidth: 1,
          backgroundColor: variantStyle.backgroundColor,
          borderColor: variantStyle.borderColor,
        },
        disabled ? { opacity: 0.5 } : undefined,
      ]}
    >
      {icon}
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: isPrimary
            ? colors.onSolid
            : isDanger
              ? colors.danger
              : colors.teal,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

export default React.memo(ActionsPanel);
