import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { CheckCircle2 } from "lucide-react-native";
import React, { useCallback } from "react";
import {
  FlatList,
  Modal,
  Pressable,
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
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(7, 10, 18, 0.58)",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
        onPress={onCancel}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 420,
            backgroundColor: colors.panel,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              paddingHorizontal: 18,
              paddingTop: 18,
              paddingBottom: 14,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 14,
                    backgroundColor: colors.success + "16",
                    borderWidth: 1,
                    borderColor: colors.success + "26",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <CheckCircle2 size={18} color={colors.success} />
                </View>
                <View>
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "700",
                      color: colors.heading,
                    }}
                  >
                    Complete Orders
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>
                    Finalize ready tickets and move them into history.
                  </Text>
                </View>
              </View>

              <View
                style={{
                  minWidth: 34,
                  height: 28,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  backgroundColor: colors.success + "16",
                  borderWidth: 1,
                  borderColor: colors.success + "28",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: colors.success,
                  }}
                >
                  {orders.length}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={{
              marginHorizontal: 18,
              marginBottom: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 14,
              backgroundColor: colors.success + "0E",
              borderWidth: 1,
              borderColor: colors.success + "24",
            }}
          >
            <Text style={{ fontSize: 12, color: colors.label, lineHeight: 18 }}>
              You are about to complete{" "}
              <Text style={{ color: colors.heading, fontWeight: "700" }}>
                {orders.length} order{orders.length !== 1 ? "s" : ""}
              </Text>
              . This finalizes inventory and clears them from the active line.
            </Text>
          </View>

          <View
            style={{
              marginHorizontal: 18,
              marginBottom: 16,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                backgroundColor: colors.panel,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: colors.muted,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                Orders Ready To Close
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>
                Review before confirming
              </Text>
            </View>

            <FlatList
              data={orders}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              style={{ maxHeight: 300 }}
              initialNumToRender={10}
              windowSize={3}
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              paddingHorizontal: 18,
              paddingVertical: 16,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.panel,
            }}
          >
            <Text style={{ flex: 1, fontSize: 11, color: colors.muted, lineHeight: 16 }}>
              This action marks every listed order as completed immediately.
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                marginLeft: 12,
              }}
            >
              <TouchableOpacity
                onPress={onCancel}
                style={{
                  height: 40,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors.label,
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
                  gap: 7,
                  height: 40,
                  paddingHorizontal: 16,
                  borderRadius: 12,
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
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default React.memo(BulkCompleteModal);
