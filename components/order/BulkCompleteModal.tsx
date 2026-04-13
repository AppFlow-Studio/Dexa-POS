import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { CheckCircle2 } from "lucide-react-native";
import React, { useCallback } from "react";
import {
  FlatList,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface BulkCompleteModalProps {
  visible: boolean;
  orders: OrderProfile[];
  onConfirm: () => void;
  onCancel: () => void;
}

const OrderRow = React.memo<{ order: OrderProfile }>(({ order }) => {
  const displayId =
    order.display_number || order.order_number || `#${order.id.slice(-4)}`;
  const total = order.total_amount ?? 0;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.success,
          marginRight: 10,
        }}
      />
      <Text
        style={{
          fontSize: 13,
          fontWeight: "700",
          color: colors.heading,
          width: 60,
        }}
      >
        {displayId}
      </Text>
      <Text
        style={{ fontSize: 12, color: colors.label, flex: 1 }}
        numberOfLines={1}
      >
        {order.customer_name || "Walk-In"}
      </Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: colors.heading,
          marginLeft: 8,
        }}
      >
        ${total.toFixed(2)}
      </Text>
    </View>
  );
});

const keyExtractor = (item: OrderProfile) => item.id;

const BulkCompleteModal: React.FC<BulkCompleteModalProps> = ({
  visible,
  orders,
  onConfirm,
  onCancel,
}) => {
  const renderItem = useCallback(
    ({ item }: { item: OrderProfile }) => <OrderRow order={item} />,
    [],
  );

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 420,
            backgroundColor: colors.panel,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 12,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: colors.success + "15",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={16} color={colors.success} />
            </View>
            <Text
              style={{ fontSize: 16, fontWeight: "700", color: colors.heading }}
            >
              Complete Orders
            </Text>
          </View>

          {/* Banner */}
          <View
            style={{
              marginHorizontal: 14,
              marginBottom: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: colors.success + "10",
              borderWidth: 1,
              borderColor: colors.success + "25",
            }}
          >
            <Text style={{ fontSize: 12, color: colors.success, lineHeight: 18 }}>
              The following {orders.length} order{orders.length !== 1 ? "s" : ""} will
              be marked as completed. This will finalize inventory and move them to
              order history.
            </Text>
          </View>

          {/* Order list */}
          <FlatList
            data={orders}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            style={{ maxHeight: 300 }}
            initialNumToRender={10}
            windowSize={3}
          />

          {/* Actions */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 14,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <TouchableOpacity
              onPress={onCancel}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 9,
                borderRadius: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: colors.muted,
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 16,
                paddingVertical: 9,
                borderRadius: 10,
                backgroundColor: colors.success,
              }}
            >
              <CheckCircle2 size={14} color={colors.onSolid} />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: colors.onSolid,
                }}
              >
                Complete All ({orders.length})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default React.memo(BulkCompleteModal);
