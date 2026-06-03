import { deriveEffectivePaidStatus } from "@/lib/deriveEffectivePaidStatus";
import {
    derivePaymentRefundState,
    getCashPricedOrderTotal,
} from "@/lib/paymentStatus";
import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import {
    AlertTriangle,
    CheckCircle,
    FileText,
    Lock,
    MoreHorizontal,
    Printer,
    RefreshCw,
    RotateCcw,
    ShoppingBag,
    Truck,
    User,
    Utensils,
    XCircle,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
    LayoutAnimation,
    Modal,
    Platform,
    Text,
    TouchableOpacity,
    UIManager,
    View,
} from "react-native";
import DeliveryPlatformBadge from "../order/DeliveryPlatformBadge";
import ExpandedOrderPanel from "./ExpandedOrderPanel";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface PreviousOrderRowProps {
  order: OrderProfile;
  isExpanded: boolean;
  onPress: (order: OrderProfile) => void;
  onDoublePress: (order: OrderProfile) => void;
  onPrint: (order: OrderProfile) => void;
  onViewTimeline: (order: OrderProfile) => void;
  onTipAdjust: (order: OrderProfile) => void;
  onViewNotes: (order: OrderProfile) => void;
  onCloseCheck?: (order: OrderProfile) => void;
  onReopenCheck?: (order: OrderProfile) => void;
  onRefund?: (order: OrderProfile) => void;
  onVoid?: (order: OrderProfile) => void;
  onContinue?: (order: OrderProfile) => void;
}

// Status → color mapping with variety
const statusColorMap: Record<string, { color: string; bgOpacity: string }> = {
  Paid: { color: colors.teal, bgOpacity: "25" },
  Partial: { color: colors.warning, bgOpacity: "25" },
  Pending: { color: colors.warning, bgOpacity: "20" },
  Unpaid: { color: colors.danger, bgOpacity: "20" },
  "In Progress": { color: colors.teal, bgOpacity: "25" },
  Refunded: { color: colors.danger, bgOpacity: "25" },
  "Partially Refunded": { color: colors.warning, bgOpacity: "20" },
};

// Order type → semantic color + icon mapping
const orderTypeColorMap: Record<
  string,
  { color: string; icon: React.ElementType }
> = {
  "Dine In": { color: colors.teal, icon: Utensils },
  dine_in: { color: colors.teal, icon: Utensils },
  Takeaway: { color: colors.teal, icon: ShoppingBag },
  takeout: { color: colors.teal, icon: ShoppingBag },
  Delivery: { color: colors.teal, icon: Truck },
  delivery: { color: colors.teal, icon: Truck },
};

const displayTypeLabels: Record<string, string> = {
  dine_in: "Dine In",
  takeout: "Takeaway",
  delivery: "Delivery",
};

const PreviousOrderRowContent: React.FC<PreviousOrderRowProps> = ({
  order,
  isExpanded,
  onPress,
  onDoublePress,
  onPrint,
  onViewTimeline,
  onTipAdjust,
  onViewNotes,
  onCloseCheck,
  onReopenCheck,
  onRefund,
  onVoid,
  onContinue,
}) => {
  const lastPressRef = useRef<number>(0);
  const DOUBLE_PRESS_DELAY = 400;

  const handlePress = () => {
    const now = Date.now();
    if (
      now - lastPressRef.current < DOUBLE_PRESS_DELAY &&
      lastPressRef.current !== 0
    ) {
      onDoublePress(order);
      lastPressRef.current = 0;
    } else {
      lastPressRef.current = now;
      setTimeout(() => {
        if (lastPressRef.current !== 0) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          onPress(order);
        }
      }, DOUBLE_PRESS_DELAY);
    }
  };

  const orderTime = order.opened_at
    ? new Date(order.opened_at).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

  const refundState = useMemo(
    () => derivePaymentRefundState(order.payments),
    [order.payments],
  );
  const totalRefunded = refundState.totalRefunded;
  const isFullyRefunded =
    order.order_status === "refunded" || refundState.isFullyRefunded;
  const displayTotal =
    getCashPricedOrderTotal(order) ?? order.total_amount ?? 0;

  const status = deriveEffectivePaidStatus(order) ?? order.paid_status ?? "Unpaid";
  const statusConfig = statusColorMap[status] ?? {
    color: colors.label,
    bgOpacity: "15",
  };

  const orderType = order.order_type || "Dine In";
  const typeConfig = orderTypeColorMap[orderType] ?? {
    color: colors.teal,
    icon: Utensils,
  };
  const TypeIcon = typeConfig.icon;
  const displayType = displayTypeLabels[orderType] || orderType;

  const needsAttention = status === "Pending";

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<View>(null);

  const openMenu = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      const menuWidth = 256;
      setMenuPos({
        top: y + height + 8,
        left: Math.max(8, x + width - menuWidth),
      });
      setMenuVisible(true);
    });
  }, []);

  const closeMenu = useCallback(() => setMenuVisible(false), []);

  const refundBadge = useMemo(() => {
    if (totalRefunded <= 0) return null;
    if (isFullyRefunded) {
      return null;
    }
    return { label: "Partial Refund", color: colors.teal };
  }, [totalRefunded, isFullyRefunded]);

  const isSettled = useMemo(() => {
    const cardPayments = (order.payments || []).filter(
      (p) => p.method !== "Cash" && !p.isVoided,
    );
    return cardPayments.length > 0 && cardPayments.every((p) => p.is_settled);
  }, [order.payments]);

  const isVoided = order.order_status === "void";

  return (
    <View
      style={{
        marginBottom: 8,
        marginHorizontal: 8,
        borderRadius: 12,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: needsAttention ? colors.warning + "30" : colors.border,
      }}
    >
      {/* Collapsed row */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handlePress}
        style={{
          backgroundColor: needsAttention
            ? colors.warning + "20"
            : colors.panel,
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          ...(needsAttention
            ? {}
            : {
                shadowColor: "#000000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 1.5,
                elevation: 1,
              }),
        }}
      >
        {/* Left: order number + meta line */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}
            >
              {order.display_number ||
                order.order_number ||
                `#${order.id.slice(-4)}`}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>
              {orderTime}
            </Text>
            {order.customer_name ? (
              <>
                <Text style={{ fontSize: 11, color: colors.muted }}>·</Text>
                <User size={11} color={colors.label} />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: colors.heading,
                  }}
                  numberOfLines={1}
                >
                  {order.customer_name}
                </Text>
              </>
            ) : null}
            <DeliveryPlatformBadge
              deliveryPlatform={order.delivery_platform}
              orderSource={order.order_source}
              size="sm"
            />
            {needsAttention && (
              <AlertTriangle size={12} color={colors.warning} />
            )}
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 3,
            }}
          >
            <TypeIcon color={typeConfig.color} size={11} />
            <Text
              style={{
                fontSize: 11,
                color: typeConfig.color,
                fontWeight: "600",
              }}
            >
              {displayType}
            </Text>
            {order.server_name ? (
              <>
                <Text style={{ fontSize: 11, color: colors.muted }}>·</Text>
                <Text
                  style={{ fontSize: 11, color: colors.label }}
                  numberOfLines={1}
                >
                  Server: {order.server_name}
                </Text>
              </>
            ) : null}
          </View>
        </View>

        {/* Status badges */}
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          {!isVoided && (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 20,
                backgroundColor: statusConfig.color + statusConfig.bgOpacity,
                borderWidth: 1,
                borderColor: statusConfig.color + "40",
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: statusConfig.color,
                }}
              >
                {status}
              </Text>
            </View>
          )}
          {refundBadge && (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 20,
                backgroundColor: refundBadge.color + "20",
                borderWidth: 1,
                borderColor: refundBadge.color + "50",
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: refundBadge.color,
                }}
              >
                {refundBadge.label}
              </Text>
            </View>
          )}
          {isVoided && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 3,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 20,
                backgroundColor: colors.danger + "20",
                borderWidth: 1,
                borderColor: colors.danger + "40",
              }}
            >
              <XCircle size={9} color={colors.danger} />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "600",
                  color: colors.danger,
                }}
              >
                Voided
              </Text>
            </View>
          )}
          {isSettled && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 3,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 20,
                backgroundColor: colors.muted + "20",
                borderWidth: 1,
                borderColor: colors.muted + "40",
              }}
            >
              <Lock size={9} color={colors.muted} />
              <Text
                style={{ fontSize: 10, fontWeight: "600", color: colors.muted }}
              >
                Settled
              </Text>
            </View>
          )}
        </View>

        {/* Price */}
        <View style={{ alignItems: "flex-end", minWidth: 70 }}>
          <Text
            style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}
          >
            ${displayTotal.toFixed(2)}
          </Text>
          {totalRefunded > 0 && (
            <Text style={{ fontSize: 11, color: colors.danger }}>
              −${totalRefunded.toFixed(2)}
            </Text>
          )}
        </View>

        {/* 3-dot menu */}
        <View ref={triggerRef} onTouchStart={(e) => e.stopPropagation()}>
          <TouchableOpacity
            onPress={openMenu}
            style={{
              padding: 6,
              borderRadius: 8,
              backgroundColor: colors.muted + "15",
            }}
          >
            <MoreHorizontal color={colors.heading} size={16} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* Expanded panel */}
      {isExpanded && (
        <ExpandedOrderPanel
          order={order}
          onPrint={onPrint}
          onViewTimeline={onViewTimeline}
          onTipAdjust={onTipAdjust}
          onRefund={onRefund}
          onContinue={onContinue}
        />
      )}

      {/* Context menu popover */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={closeMenu}
          style={{ flex: 1 }}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{
              position: "absolute",
              top: menuPos.top,
              left: menuPos.left,
              width: 220,
              backgroundColor: colors.panel,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              paddingVertical: 4,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.35,
              shadowRadius: 16,
              elevation: 20,
            }}
          >
            {status === "Paid" &&
              order.check_status !== "Closed" &&
              onCloseCheck && (
                <MenuRow
                  icon={<CheckCircle color={colors.success} size={15} />}
                  label="Close Check"
                  iconBg={colors.success + "15"}
                  onPress={() => {
                    closeMenu();
                    onCloseCheck(order);
                  }}
                />
              )}
            {order.check_status === "Closed" && onReopenCheck && (
              <MenuRow
                icon={<RefreshCw color={colors.info} size={15} />}
                label="Reopen Check"
                iconBg={colors.info + "15"}
                onPress={() => {
                  closeMenu();
                  onReopenCheck(order);
                }}
              />
            )}
            {onRefund && !isFullyRefunded && (
              <MenuRow
                icon={<RotateCcw color={colors.teal} size={15} />}
                label="Process Refund"
                iconBg={colors.teal + "15"}
                onPress={() => {
                  closeMenu();
                  onRefund(order);
                }}
              />
            )}
            <MenuRow
              icon={<FileText color={colors.info} size={15} />}
              label="View Notes"
              iconBg={colors.info + "15"}
              onPress={() => {
                closeMenu();
                onViewNotes(order);
              }}
            />
            <MenuRow
              icon={<Printer color={colors.label} size={15} />}
              label="Print Receipt"
              iconBg={colors.card}
              onPress={() => {
                closeMenu();
                onPrint(order);
              }}
            />
            {onVoid && (
              <>
                <View
                  style={{
                    height: 1,
                    backgroundColor: colors.border,
                    marginVertical: 4,
                    marginHorizontal: 12,
                  }}
                />
                <MenuRow
                  icon={<XCircle color={colors.danger} size={15} />}
                  label="Void Order"
                  iconBg={colors.danger + "15"}
                  labelColor={colors.danger}
                  onPress={() => {
                    closeMenu();
                    onVoid(order);
                  }}
                />
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const MenuRow = ({
  icon,
  label,
  iconBg,
  labelColor,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  iconBg: string;
  labelColor?: string;
  onPress: () => void;
}) => (
  <TouchableOpacity
    activeOpacity={0.6}
    onPress={onPress}
    style={{
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginHorizontal: 4,
      borderRadius: 8,
    }}
  >
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        backgroundColor: iconBg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon}
    </View>
    <Text
      style={{
        fontSize: 13,
        color: labelColor ?? colors.heading,
        fontWeight: "500",
      }}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const PreviousOrderRow = React.memo(PreviousOrderRowContent, (prev, next) => {
  return (
    prev.order.id === next.order.id &&
    prev.order.paid_status === next.order.paid_status &&
    prev.order.order_status === next.order.order_status &&
    prev.order.order_type === next.order.order_type &&
    prev.order.total_amount === next.order.total_amount &&
    prev.order.total_discount === next.order.total_discount &&
    prev.order.notes === next.order.notes &&
    prev.order.check_status === next.order.check_status &&
    prev.order.payments === next.order.payments &&
    prev.order.customer_name === next.order.customer_name &&
    prev.order.server_name === next.order.server_name &&
    prev.isExpanded === next.isExpanded &&
    prev.onContinue === next.onContinue
  );
});
export default PreviousOrderRow;
