import { OrderProfile } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { ArrowUpRight, Archive, RefreshCcw, Repeat2 } from "lucide-react-native";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface OrderCardProps {
  order: OrderProfile;
  onViewItems: () => void;
  onComplete: () => void;
  onRetrieve?: () => void;
  onMarkDone?: () => void;
  onReopenCheck?: () => void;
}

const OrderCard: React.FC<OrderCardProps> = ({
  order,
  onViewItems,
  onComplete,
  onRetrieve,
  onMarkDone,
  onReopenCheck,
}) => {
  const tablesById = useFloorPlanStore((s) => s.tablesById);

  // Look up table name from service_location_id
  const tableName = useMemo(() => {
    if (!order.service_location_id) return null;
    const table = tablesById[order.service_location_id];
    return table?.name || null;
  }, [order.service_location_id, tablesById]);

  // Derive refund status
  const refundStatus = useMemo(() => {
    const payments = order.payments || [];
    if (payments.length === 0) {
      return { hasRefund: false, isFullyRefunded: false, isPartiallyRefunded: false };
    }
    
    const hasRefund = payments.some(p => (p.refundedAmount ?? 0) > 0);
    const isFullyRefunded = payments.length > 0 && payments.every(
      p => (p.refundedAmount ?? 0) >= (p.amount ?? 0)
    );
    const isPartiallyRefunded = hasRefund && !isFullyRefunded;
    
    return { hasRefund, isFullyRefunded, isPartiallyRefunded };
  }, [order.payments]);

  // Derive closed with balance status
  const isClosedWithBalance = order.check_status === "Closed" && (order.amount_due ?? 0) > 0;

  const isReady =
    order.order_status === "ready" || order.order_status === "completed";
  const statusBg = isReady ? "bg-blue-100" : "bg-[#DC9F1E33]";
  const statusText = isReady ? "text-blue-700" : "text-[#DC9F1E]";
  
  // Adjust paid status colors based on refund status
  const paidBg = refundStatus.isFullyRefunded
    ? "bg-red-500/20"
    : refundStatus.isPartiallyRefunded
    ? "bg-orange-500/20"
    : order.paid_status === "Paid"
    ? "bg-green-500/20"
    : order.paid_status === "Pending"
    ? "bg-yellow-500/20"
    : "bg-red-500/20";
  const paidText = refundStatus.isFullyRefunded
    ? "text-red-400"
    : refundStatus.isPartiallyRefunded
    ? "text-orange-400"
    : order.paid_status === "Paid"
    ? "text-green-400"
    : order.paid_status === "Pending"
    ? "text-yellow-700"
    : "text-red-400";
  const paidLabel = refundStatus.isFullyRefunded
    ? "REFUNDED"
    : refundStatus.isPartiallyRefunded
    ? "Partial Refund"
    : order.paid_status;
    
  const isUnpaid = order.paid_status !== "Paid";
  return (
    <View className="bg-[#303030] p-3 rounded-2xl border border-gray-700 w-72 mr-4">
      <View className="flex-row items-center gap-2">
        <View className={`px-3 py-1 rounded-full self-start ${statusBg}`}>
          <Text className={`text-base font-bold ${statusText}`}>
            {order.order_status}
          </Text>
        </View>
        <View className={`px-3 py-1 rounded-full self-start ${paidBg}`}>
          <Text className={`text-base font-bold ${paidText}`}>
            {paidLabel}
          </Text>
        </View>
        {/* Closed badge when closed with outstanding balance */}
        {isClosedWithBalance && (
          <View className="px-3 py-1 rounded-full self-start bg-gray-500/20">
            <Text className="text-base font-bold text-gray-400">Closed</Text>
          </View>
        )}
      </View>
      <Text className="text-xl font-bold text-white mt-2">
        {order.customer_name || "Walk-In"} {order?.display_number}
      </Text>
      <View className="flex-row justify-between mt-2">
        <Text className="text-lg text-gray-400 ">
          {order.order_type}
          {tableName && <> • Table {tableName}</>}
        </Text>
        <Text className="text-lg text-gray-400">
          {new Date(order.opened_at!).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
      {/* Phase 5: Show source station for orders from other stations */}
      {order._sourceStationName && order.station_id !== useOrderStore.getState().currentStationId && (
        <View className="flex-row items-center mt-1">
          <Repeat2 color="#3b82f6" size={12} />
          <Text className="text-blue-400 text-xs ml-1">
            From {order._sourceStationName}
          </Text>
        </View>
      )}
      <View className="flex-row justify-between items-center mt-4">
        <TouchableOpacity
          onPress={onViewItems}
          className="flex-row items-center justify-center py-2 px-3 rounded-xl border border-gray-600 bg-[#212121]"
        >
          <Text className="font-semibold text-white text-base mr-1">
            View Items
          </Text>
          <ArrowUpRight color="#FFFFFF" size={18} />
        </TouchableOpacity>
        
        {/* Smart actions for closed orders with balance or fully refunded */}
        {(isClosedWithBalance || refundStatus.isFullyRefunded) ? (
          <View className="flex-row flex-1 ml-2 gap-2">
            {onMarkDone && (
              <TouchableOpacity
                onPress={onMarkDone}
                className="px-3 py-2 bg-gray-600 rounded-xl flex-1 flex-row items-center justify-center"
              >
                <Archive color="#FFFFFF" size={16} />
                <Text className="text-white font-bold text-center text-sm ml-1">
                  Done
                </Text>
              </TouchableOpacity>
            )}
            {onReopenCheck && !refundStatus.isFullyRefunded && (
              <TouchableOpacity
                onPress={onReopenCheck}
                className="px-3 py-2 bg-blue-600 rounded-xl flex-1 flex-row items-center justify-center"
              >
                <RefreshCcw color="#FFFFFF" size={16} />
                <Text className="text-white font-bold text-center text-sm ml-1">
                  Reopen
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TouchableOpacity
            onPress={onComplete}
            className="px-4 py-2 bg-blue-600 rounded-xl flex-1 ml-2"
          >
            <Text className="text-white font-bold text-center text-base">
              Complete
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {isUnpaid && onRetrieve && !isClosedWithBalance && !refundStatus.isFullyRefunded && (
        <View className="mt-2">
          <TouchableOpacity
            onPress={onRetrieve}
            className="px-4 py-2 bg-blue-600 rounded-xl"
          >
            <Text className="text-white font-bold text-center text-base">
              Retrieve to Pay
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export default React.memo(OrderCard);
