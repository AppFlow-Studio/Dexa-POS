import { OrderProfile } from "@/lib/types";
import {
  CheckCircle,
  DollarSign,
  MoreHorizontal,
  Printer,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Truck,
  Utensils,
  XCircle,
} from "lucide-react-native";
import React, { useMemo, useRef } from "react";
import { LayoutAnimation, Platform, Text, TouchableOpacity, UIManager, View } from "react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import ExpandedOrderPanel from "./ExpandedOrderPanel";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
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
}

const statusConfig: Record<string, { bg: string; text: string }> = {
  Paid: { bg: "bg-green-900/50", text: "text-green-400" },
  Partial: { bg: "bg-yellow-900/50", text: "text-yellow-400" },
  Pending: { bg: "bg-orange-900/50", text: "text-orange-400" },
  Unpaid: { bg: "bg-red-900/50", text: "text-red-400" },
  "In Progress": { bg: "bg-blue-900/50", text: "text-blue-400" },
  Refunded: { bg: "bg-red-900/50", text: "text-red-400" },
  "Partially Refunded": { bg: "bg-yellow-900/50", text: "text-yellow-400" },
};

const orderTypeConfig: Record<
  string,
  { bg: string; text: string; icon: React.ElementType }
> = {
  "Dine In": { bg: "bg-purple-900/50", text: "text-purple-400", icon: Utensils },
  dine_in: { bg: "bg-purple-900/50", text: "text-purple-400", icon: Utensils },
  Takeaway: { bg: "bg-orange-900/50", text: "text-orange-400", icon: ShoppingBag },
  takeout: { bg: "bg-orange-900/50", text: "text-orange-400", icon: ShoppingBag },
  Delivery: { bg: "bg-cyan-900/50", text: "text-cyan-400", icon: Truck },
  delivery: { bg: "bg-cyan-900/50", text: "text-cyan-400", icon: Truck },
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
}) => {
  const lastPressRef = useRef<number>(0);
  const DOUBLE_PRESS_DELAY = 400;

  const handlePress = () => {
    const now = Date.now();
    if (now - lastPressRef.current < DOUBLE_PRESS_DELAY && lastPressRef.current !== 0) {
      onDoublePress(order);
      lastPressRef.current = 0;
    } else {
      lastPressRef.current = now;
      // Delay single-press action to distinguish from double-press
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

  const itemsPreview = useMemo(() => {
    if (!order.items?.length) return "";
    return order.items
      .slice(0, 3)
      .map((i) => i.name)
      .join(", ");
  }, [order.items]);

  const totalRefunded = useMemo(
    () =>
      (order.payments || []).reduce(
        (sum, p) => sum + (p.refundedAmount ?? 0),
        0,
      ),
    [order.payments],
  );

  const isFullyRefunded =
    order.order_status === "refunded" ||
    (totalRefunded > 0 && totalRefunded >= (order.total_amount || 0));

  const status = order.paid_status || "Unpaid";
  const statusStyle = statusConfig[status] || {
    bg: "bg-gray-700",
    text: "text-gray-300",
  };

  const orderType = order.order_type || "Dine In";
  const typeConfig = orderTypeConfig[orderType] || {
    bg: "bg-gray-700",
    text: "text-gray-300",
    icon: Utensils,
  };
  const TypeIcon = typeConfig.icon;
  const displayType = displayTypeLabels[orderType] || orderType;

  // "Needs Attention" = Paid but check not closed
  const needsAttention =
    order.paid_status === "Paid" && order.check_status !== "Closed";

  // Server initials for avatar
  const serverInitials = useMemo(() => {
    const name = order.server_name || "";
    const parts = name.split(" ").filter(Boolean);
    if (parts.length >= 2) return parts[0][0] + parts[1][0];
    if (parts.length === 1) return parts[0][0];
    return "?";
  }, [order.server_name]);

  // Refund status badge
  const refundBadge = useMemo(() => {
    if (totalRefunded <= 0) return null;
    if (isFullyRefunded) {
      return { label: "Refunded", bg: "bg-red-900/50", text: "text-red-400" };
    }
    return {
      label: "Partial Refund",
      bg: "bg-purple-900/50",
      text: "text-purple-400",
    };
  }, [totalRefunded, isFullyRefunded]);

  return (
    <View
      className="mb-2 mx-2 rounded-xl overflow-hidden"
      style={
        needsAttention
          ? { borderLeftWidth: 4, borderLeftColor: "#EAB308" }
          : undefined
      }
    >
      {/* Collapsed row */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={handlePress}
        className="bg-[#303030] px-4 py-3"
      >
        <View className="flex-row items-center">
          {/* Order number + time + items preview */}
          <View className="flex-1" style={{ minWidth: 180 }}>
            <View className="flex-row items-center gap-2">
              <Text className="text-base font-bold text-white">
                {order.display_number || order.order_number || `#${order.id.slice(-4)}`}
              </Text>
              <Text className="text-sm text-gray-400">{orderTime}</Text>
            </View>
            <Text
              className="text-xs text-gray-500 mt-0.5"
              numberOfLines={1}
            >
              {itemsPreview || "No items"}
            </Text>
          </View>

          {/* Status badge */}
          <View className="items-center mx-2" style={{ width: 100 }}>
            <View
              className={`px-2.5 py-1 rounded-md ${statusStyle.bg}`}
            >
              <Text className={`text-xs font-bold ${statusStyle.text}`}>
                {status}
              </Text>
            </View>
            {refundBadge && (
              <View
                className={`px-2 py-0.5 rounded-md mt-1 ${refundBadge.bg}`}
              >
                <Text className={`text-xs font-bold ${refundBadge.text}`}>
                  {refundBadge.label}
                </Text>
              </View>
            )}
          </View>

          {/* Server avatar */}
          <View className="items-center mx-2" style={{ width: 70 }}>
            <View className="w-8 h-8 rounded-full bg-blue-900/50 items-center justify-center">
              <Text className="text-xs font-bold text-blue-400">
                {serverInitials.toUpperCase()}
              </Text>
            </View>
            <Text
              className="text-xs text-gray-400 mt-0.5"
              numberOfLines={1}
            >
              {order.server_name || "-"}
            </Text>
          </View>

          {/* Item count pill */}
          <View className="mx-2" style={{ width: 40 }}>
            <View className="bg-gray-700 rounded-full px-2 py-0.5 self-center">
              <Text className="text-xs font-semibold text-gray-300 text-center">
                {order.items?.length || 0}
              </Text>
            </View>
          </View>

          {/* Order type */}
          <View className="mx-2" style={{ width: 90 }}>
            <View
              className={`flex-row items-center gap-1 px-2 py-1 rounded-md self-start ${typeConfig.bg}`}
            >
              <TypeIcon
                color={
                  typeConfig.text.includes("purple")
                    ? "#A78BFA"
                    : typeConfig.text.includes("orange")
                      ? "#FB923C"
                      : "#22D3EE"
                }
                size={12}
              />
              <Text className={`text-xs font-semibold ${typeConfig.text}`}>
                {displayType}
              </Text>
            </View>
          </View>

          {/* Total */}
          <View className="items-end mx-2" style={{ width: 80 }}>
            <Text className="text-base font-bold text-white">
              ${(order.total_amount ?? 0).toFixed(2)}
            </Text>
            {totalRefunded > 0 && (
              <Text className="text-xs text-red-400">
                -${totalRefunded.toFixed(2)}
              </Text>
            )}
          </View>

          {/* Menu */}
          <View
            style={{ width: 36 }}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <TouchableOpacity className="p-1">
                  <MoreHorizontal color="#9CA3AF" size={20} />
                </TouchableOpacity>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 bg-[#303030] border-gray-600">
                {order.paid_status === "Paid" &&
                  order.check_status !== "Closed" &&
                  onCloseCheck && (
                    <DropdownMenuItem
                      onTouchStart={(e) => e.stopPropagation()}
                      onPress={() => onCloseCheck(order)}
                    >
                      <CheckCircle className="mr-2 h-5 w-5" color="#4ade80" />
                      <Text className="text-xl text-white">Close Check</Text>
                    </DropdownMenuItem>
                  )}
                {order.check_status === "Closed" && onReopenCheck && (
                  <DropdownMenuItem
                    onTouchStart={(e) => e.stopPropagation()}
                    onPress={() => onReopenCheck(order)}
                  >
                    <RefreshCw className="mr-2 h-5 w-5" color="#60a5fa" />
                    <Text className="text-xl text-white">Reopen Check</Text>
                  </DropdownMenuItem>
                )}
                {onRefund && (
                  <DropdownMenuItem
                    onTouchStart={(e) => e.stopPropagation()}
                    onPress={() => onRefund(order)}
                  >
                    <RotateCcw className="mr-2 h-5 w-5" color="#f59e0b" />
                    <Text className="text-xl text-white">Process Refund</Text>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onTouchStart={(e) => e.stopPropagation()}
                  onPress={() => onViewNotes(order)}
                >
                  <DollarSign className="mr-2 h-5 w-5" color="#9CA3AF" />
                  <Text className="text-xl text-white">View Notes</Text>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onTouchStart={(e) => e.stopPropagation()}
                  onPress={() => onPrint(order)}
                >
                  <Printer className="mr-2 h-5 w-5" color="#9CA3AF" />
                  <Text className="text-xl text-white">Print Receipt</Text>
                </DropdownMenuItem>
                {onVoid && (
                  <DropdownMenuItem
                    onTouchStart={(e) => e.stopPropagation()}
                    onPress={() => onVoid(order)}
                  >
                    <XCircle className="mr-2 h-5 w-5" color="#F87171" />
                    <Text className="text-xl text-red-400">Void Order</Text>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </View>
        </View>
      </TouchableOpacity>

      {/* Expanded panel */}
      {isExpanded && (
        <ExpandedOrderPanel
          order={order}
          onPrint={onPrint}
          onViewTimeline={onViewTimeline}
          onTipAdjust={onTipAdjust}
        />
      )}
    </View>
  );
};

const PreviousOrderRow = React.memo(
  PreviousOrderRowContent,
  (prev, next) => {
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
      prev.isExpanded === next.isExpanded
    );
  },
);
export default PreviousOrderRow;
