import { colors } from "@/lib/theme";
import { PreviousOrder } from "@/lib/types";
import {
  Clock,
  MapPin,
  Monitor,
  ShoppingBag,
  Truck,
  User,
  Users,
  Utensils,
} from "lucide-react-native";
import React, { useMemo } from "react";
import { Text, View } from "react-native";

interface OrderMetadataProps {
  order: PreviousOrder;
}

const typeIcons: Record<string, React.ElementType> = {
  "Dine In": Utensils,
  Takeaway: ShoppingBag,
  Delivery: Truck,
};

const OrderMetadata: React.FC<OrderMetadataProps> = ({ order }) => {
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

  const TypeIcon = typeIcons[order.type] || Utensils;

  return (
    <View className="bg-panel rounded-xl p-4 mt-4 border border-gray-700">
      <Text className="text-base font-bold text-white mb-3">
        Order Details
      </Text>

      <MetadataRow
        icon={<TypeIcon color={colors.label} size={16} />}
        label="Order Type"
        value={order.type}
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
        value={order.server}
      />

      {order.station_name && (
        <MetadataRow
          icon={<Monitor color={colors.label} size={16} />}
          label="Station"
          value={order.station_name}
        />
      )}

      <MetadataRow
        icon={<Users color={colors.label} size={16} />}
        label="Customer"
        value={order.customer}
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
    </View>
  );
};

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

export default React.memo(OrderMetadata);
