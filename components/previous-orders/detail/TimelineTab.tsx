import { OrderProfile } from "@/lib/types";
import { colors } from "@/lib/theme";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import React, { useMemo } from "react";
import { Text, View } from "react-native";

interface TimelineTabProps {
  order: OrderProfile;
  statusHistory?: Array<{
    id: string;
    status: string;
    changed_at: string;
    changed_by?: string;
    notes?: string;
  }>;
}

interface TimelineEvent {
  timestamp: string;
  label: string;
  detail?: string;
  color: string;
}

function buildTimeline(
  order: OrderProfile,
  statusHistory?: TimelineTabProps["statusHistory"],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Order created
  if (order.opened_at) {
    events.push({
      timestamp: order.opened_at,
      label: "Order Created",
      color: colors.orderCompleted,
    });
  }

  // Sent to kitchen
  if (order.sent_to_kitchen_at) {
    events.push({
      timestamp: order.sent_to_kitchen_at,
      label: "Sent to Kitchen",
      color: colors.orderPreparing,
    });
  }

  // Status history events from backend (if available)
  if (statusHistory && statusHistory.length > 0) {
    statusHistory.forEach((entry) => {
      const statusLabels: Record<string, string> = {
        pending: "Order Pending",
        preparing: "Preparing",
        ready: "Ready for Pickup",
        completed: "Completed",
        cancelled: "Cancelled",
        void: "Voided",
        refunded: "Refunded",
      };
      const statusColorMap: Record<string, string> = {
        pending: colors.orderPreparing,
        preparing: colors.orderCompleted,
        ready: colors.orderReady,
        completed: colors.orderReady,
        cancelled: colors.orderCancelled,
        void: colors.orderCancelled,
        refunded: colors.orderCancelled,
      };

      events.push({
        timestamp: entry.changed_at,
        label: statusLabels[entry.status] || `Status: ${entry.status}`,
        detail: entry.notes || (entry.changed_by ? `By: ${entry.changed_by}` : undefined),
        color: statusColorMap[entry.status] || colors.orderDefault,
      });
    });
  }

  // Payments
  if (order.payments) {
    order.payments.forEach((payment, idx) => {
      const methodLabel =
        payment.method === "Cash"
          ? "Cash"
          : payment.cardBrand
            ? `${payment.cardBrand} ${payment.last4 ? `••${payment.last4}` : ""}`
            : "Card";

      events.push({
        timestamp: payment.timestamp,
        label: `Payment #${idx + 1} (${methodLabel})`,
        detail: `$${payment.amount.toFixed(2)}${payment.tip_amount > 0 ? ` + $${payment.tip_amount.toFixed(2)} tip` : ""}`,
        color: payment.isVoided ? colors.orderCancelled : colors.paymentPaid,
      });

      // Tip adjustment
      if (payment.tip_adjusted_at) {
        events.push({
          timestamp: payment.tip_adjusted_at,
          label: `Tip Adjusted on Payment #${idx + 1}`,
          detail: `New tip: $${payment.tip_amount.toFixed(2)}${payment.original_tip_amount != null ? ` (was $${payment.original_tip_amount.toFixed(2)})` : ""}`,
          color: colors.orderSentToKitchen,
        });
      }

      // Voided payment
      if (payment.isVoided && payment.voidedAt) {
        events.push({
          timestamp: payment.voidedAt,
          label: `Payment #${idx + 1} Voided`,
          detail: payment.voidReason || undefined,
          color: colors.orderCancelled,
        });
      }
    });
  }

  // Reversals
  if (order.reversals) {
    order.reversals.forEach((reversal) => {
      const ts = reversal.completed_at || reversal.requested_at;
      const typeLabel =
        reversal.reversal_type === "void"
          ? "Void"
          : reversal.reversal_type === "refund"
            ? "Refund"
            : reversal.reversal_type === "partial_refund"
              ? "Partial Refund"
              : "Item Return";

      events.push({
        timestamp: ts,
        label: `${typeLabel} Processed`,
        detail: `$${reversal.amount.toFixed(2)}${reversal.reason_description ? ` - ${reversal.reason_description}` : ""}`,
        color: colors.orderCancelled,
      });
    });
  }

  // Order closed
  if (order.closed_at) {
    events.push({
      timestamp: order.closed_at,
      label: "Order Closed",
      color: colors.orderDefault,
    });
  }

  // Sort chronologically
  events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return events;
}

const TimelineTab: React.FC<TimelineTabProps> = ({ order, statusHistory }) => {
  const events = useMemo(
    () => buildTimeline(order, statusHistory),
    [order, statusHistory],
  );

  if (events.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <Text className="text-gray-500 text-lg">No timeline data</Text>
        <Text className="text-gray-600 text-sm mt-1">
          No events recorded for this order
        </Text>
      </View>
    );
  }

  return (
    <BottomSheetScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      {events.map((event, idx) => {
        const isLast = idx === events.length - 1;
        return (
          <View key={`${event.timestamp}-${idx}`} className="flex-row">
            {/* Timeline column */}
            <View className="items-center mr-3" style={{ width: 20 }}>
              <View
                className="rounded-full"
                style={{
                  width: 12,
                  height: 12,
                  backgroundColor: event.color,
                  marginTop: 4,
                }}
              />
              {!isLast && (
                <View
                  className="flex-1"
                  style={{
                    width: 2,
                    backgroundColor: colors.border,
                    minHeight: 40,
                  }}
                />
              )}
            </View>

            {/* Content */}
            <View className="flex-1 pb-5">
              <Text className="text-sm font-semibold text-white">
                {event.label}
              </Text>
              {event.detail && (
                <Text className="text-xs text-gray-400 mt-0.5">
                  {event.detail}
                </Text>
              )}
              <Text className="text-xs text-gray-500 mt-1">
                {formatTimestamp(event.timestamp)}
              </Text>
            </View>
          </View>
        );
      })}

      <View className="h-4" />
    </BottomSheetScrollView>
  );
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default React.memo(TimelineTab);
