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
    <View
      style={{
        backgroundColor: colors.panel,
        borderRadius: 12,
        padding: 12,
        marginTop: 12,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: "700",
          color: colors.heading,
          marginBottom: 10,
        }}
      >
        Order Details
      </Text>

      <MetadataRow
        icon={<TypeIcon color={colors.teal} size={15} />}
        label="Order Type"
        value={order.type}
      />

      {order.service_location_name && (
        <MetadataRow
          icon={<MapPin color={colors.teal} size={15} />}
          label="Table / Location"
          value={order.service_location_name}
        />
      )}

      <MetadataRow
        icon={<User color={colors.teal} size={15} />}
        label="Server"
        value={order.server}
      />

      {order.station_name && (
        <MetadataRow
          icon={<Monitor color={colors.teal} size={15} />}
          label="Station"
          value={order.station_name}
        />
      )}

      <MetadataRow
        icon={<Users color={colors.teal} size={15} />}
        label="Customer"
        value={order.customer}
      />

      {order.opened_at && (
        <MetadataRow
          icon={<Clock color={colors.teal} size={15} />}
          label="Opened"
          value={formatDateTime(order.opened_at)}
        />
      )}

      {order.closed_at && (
        <MetadataRow
          icon={<Clock color={colors.teal} size={15} />}
          label="Closed"
          value={formatDateTime(order.closed_at)}
        />
      )}

      {duration && (
        <MetadataRow
          icon={<Clock color={colors.teal} size={15} />}
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
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 7,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    }}
  >
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.teal + "15",
        borderWidth: 1,
        borderColor: colors.teal + "30",
        marginRight: 8,
      }}
    >
      {icon}
    </View>
    <Text style={{ fontSize: 12, color: colors.label, flex: 1 }}>{label}</Text>
    <Text
      style={{ fontSize: 12, fontWeight: "600", color: colors.heading, maxWidth: "50%" }}
      numberOfLines={1}
    >
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
