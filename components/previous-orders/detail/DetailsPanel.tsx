import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { BottomSheetScrollView } from "@/components/ui/bottomSheet";
import React, { useMemo } from "react";
import { Text, View } from "react-native";
import {
  Clock,
  MapPin,
  Monitor,
  ShoppingBag,
  Truck,
  User,
  Utensils,
} from "lucide-react-native";

interface DetailsPanelProps {
  order: OrderProfile;
}

const typeIcons: Record<string, React.ElementType> = {
  "Dine In": Utensils,
  dine_in: Utensils,
  Takeaway: ShoppingBag,
  takeout: ShoppingBag,
  Delivery: Truck,
  delivery: Truck,
};

const displayTypeLabels: Record<string, string> = {
  dine_in: "Dine In",
  takeout: "Takeaway",
  delivery: "Delivery",
};

const DetailsPanel: React.FC<DetailsPanelProps> = ({ order }) => {
  const tipTotal = useMemo(() => {
    if (!order.payments) return 0;
    return order.payments
      .filter((p) => !p.isVoided)
      .reduce((sum, p) => sum + (p.tip_amount || 0), 0);
  }, [order.payments]);

  const totalRefunded = useMemo(() => {
    return (order.payments || []).reduce(
      (sum, p) => sum + (p.refundedAmount ?? 0),
      0,
    );
  }, [order.payments]);

  const balanceDue = order.amount_due || 0;

  const orderType = order.order_type || "Dine In";
  const TypeIcon = typeIcons[orderType] || Utensils;
  const displayType = displayTypeLabels[orderType] || orderType;

  const duration = useMemo(() => {
    if (!order.opened_at || !order.closed_at) return null;
    const start = new Date(order.opened_at).getTime();
    const end = new Date(order.closed_at).getTime();
    const diff = end - start;
    if (diff <= 0) return null;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return hours > 0 ? `${hours}h ${remMins}m` : `${remMins}m`;
  }, [order.opened_at, order.closed_at]);

  const activePayments = useMemo(() => {
    return (order.payments || []).filter((p) => !p.isVoided);
  }, [order.payments]);

  return (
    <BottomSheetScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Summary Cards */}
      <View className="flex-row flex-wrap gap-3 mb-4">
        <SummaryCard
          label="Order Total"
          value={order.total_amount ?? 0}
          borderColor="#3B82F6"
        />
        <SummaryCard
          label="Amount Paid"
          value={order.amount_paid || 0}
          borderColor="#22C55E"
        />
        <SummaryCard
          label="Tips"
          value={tipTotal}
          borderColor="#8B5CF6"
        />
        <SummaryCard
          label="Refunded"
          value={totalRefunded}
          borderColor="#EF4444"
        />
      </View>

      {balanceDue > 0 && (
        <View
          className="bg-surface rounded-xl p-4 mb-4"
          style={{ borderWidth: 1, borderColor: colors.warning }}
        >
          <Text className="text-xs text-yellow-400 mb-1">Balance Due</Text>
          <Text className="text-xl font-bold text-yellow-400">
            ${balanceDue.toFixed(2)}
          </Text>
        </View>
      )}

      {/* Order Details */}
      <View className="bg-surface rounded-xl p-4 mb-4 border border-gray-700">
        <Text className="text-base font-bold text-white mb-3">
          Order Details
        </Text>

        <MetadataRow
          icon={<TypeIcon color={colors.label} size={16} />}
          label="Order Type"
          value={displayType}
        />

        {order.service_location_name && (
          <MetadataRow
            icon={<MapPin color={colors.label} size={16} />}
            label="Table / Location"
            value={order.service_location_name}
          />
        )}

        <MetadataRow
          icon={<User color={colors.label} size={16} />}
          label="Server"
          value={order.server_name || "-"}
        />

        {order._sourceStationName && (
          <MetadataRow
            icon={<Monitor color={colors.label} size={16} />}
            label="Station"
            value={order._sourceStationName}
          />
        )}

        <MetadataRow
          icon={<User color={colors.label} size={16} />}
          label="Customer"
          value={order.customer_name || "Walk-In"}
        />

        {order.opened_at && (
          <MetadataRow
            icon={<Clock color={colors.label} size={16} />}
            label="Opened"
            value={formatDateTime(order.opened_at)}
          />
        )}

        {order.closed_at && (
          <MetadataRow
            icon={<Clock color={colors.label} size={16} />}
            label="Closed"
            value={formatDateTime(order.closed_at)}
          />
        )}

        {duration && (
          <MetadataRow
            icon={<Clock color={colors.label} size={16} />}
            label="Duration"
            value={duration}
          />
        )}

        <MetadataRow
          icon={<Clock color={colors.label} size={16} />}
          label="Check Status"
          value={order.check_status || "Opened"}
        />
      </View>

      {/* Payment Breakdown */}
      {activePayments.length > 0 && (
        <View className="bg-surface rounded-xl p-4 border border-gray-700">
          <Text className="text-base font-bold text-white mb-3">
            Payments
          </Text>
          {activePayments.map((payment, idx) => {
            const methodLabel =
              payment.method === "Cash"
                ? "Cash"
                : `${payment.cardBrand || "Card"} ${payment.last4 ? `••••${payment.last4}` : ""}`.trim();
            return (
              <View
                key={payment.id || idx}
                className="bg-panel rounded-lg p-3 mb-2 border border-gray-700"
              >
                <View className="flex-row justify-between mb-1">
                  <Text className="text-sm font-semibold text-white">
                    {methodLabel}
                  </Text>
                  <Text className="text-sm font-bold text-white">
                    ${payment.amount.toFixed(2)}
                  </Text>
                </View>
                {payment.tip_amount > 0 && (
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-400">Tip</Text>
                    <Text className="text-xs text-green-400">
                      +${payment.tip_amount.toFixed(2)}
                    </Text>
                  </View>
                )}
                {(payment.refundedAmount ?? 0) > 0 && (
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-gray-400">Refunded</Text>
                    <Text className="text-xs text-red-400">
                      -${(payment.refundedAmount ?? 0).toFixed(2)}
                    </Text>
                  </View>
                )}
                <Text className="text-xs text-gray-500 mt-1">
                  {payment.status} | {formatDateTime(payment.timestamp)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <View className="h-8" />
    </BottomSheetScrollView>
  );
};

const SummaryCard = ({
  label,
  value,
  borderColor,
}: {
  label: string;
  value: number;
  borderColor: string;
}) => (
  <View
    className="bg-surface rounded-xl p-4"
    style={{
      borderWidth: 1,
      borderColor,
      width: "48%",
      flexGrow: 1,
    }}
  >
    <Text className="text-xs text-gray-400 mb-1">{label}</Text>
    <Text className="text-lg font-bold text-white">${value.toFixed(2)}</Text>
  </View>
);

const MetadataRow = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <View className="flex-row items-center py-2 border-b border-dashed border-gray-700">
    <View className="mr-2">{icon}</View>
    <Text className="text-sm text-gray-400 flex-1">{label}</Text>
    <Text className="text-sm font-semibold text-white" numberOfLines={1}>
      {value}
    </Text>
  </View>
);

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default React.memo(DetailsPanel);
