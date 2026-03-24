import { OrderProfile } from "@/lib/types";
import { colors } from "@/lib/theme";
import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";

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
      color: colors.teal,
    });
  }

  // Sent to kitchen
  if (order.sent_to_kitchen_at) {
    events.push({
      timestamp: order.sent_to_kitchen_at,
      label: "Sent to Kitchen",
      color: colors.teal,
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
        pending: colors.teal,
        preparing: colors.teal,
        ready: colors.success,
        completed: colors.success,
        cancelled: colors.danger,
        void: colors.danger,
        refunded: colors.danger,
      };

      events.push({
        timestamp: entry.changed_at,
        label: statusLabels[entry.status] || `Status: ${entry.status}`,
        detail: entry.notes || (entry.changed_by ? `By: ${entry.changed_by}` : undefined),
        color: statusColorMap[entry.status] || colors.teal,
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
        color: payment.isVoided ? colors.danger : colors.teal,
      });

      // Tip adjustment
      if (payment.tip_adjusted_at) {
        events.push({
          timestamp: payment.tip_adjusted_at,
          label: `Tip Adjusted on Payment #${idx + 1}`,
          detail: `New tip: $${payment.tip_amount.toFixed(2)}${payment.original_tip_amount != null ? ` (was $${payment.original_tip_amount.toFixed(2)})` : ""}`,
          color: colors.teal,
        });
      }

      // Voided payment
      if (payment.isVoided && payment.voidedAt) {
        events.push({
          timestamp: payment.voidedAt,
          label: `Payment #${idx + 1} Voided`,
          detail: payment.voidReason || undefined,
          color: colors.danger,
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
        color: colors.danger,
      });
    });
  }

  // Order closed
  if (order.closed_at) {
    events.push({
      timestamp: order.closed_at,
      label: "Order Closed",
      color: colors.teal,
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
        <Text style={{ fontSize: 18, color: colors.muted }}>
          No timeline data
        </Text>
        <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>
          No events recorded for this order
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      {events.map((event, idx) => {
        const isLast = idx === events.length - 1;
        return (
          <View key={`${event.timestamp}-${idx}`} className="flex-row" style={{ marginBottom: 6 }}>
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
              <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
                <Text
                  style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}
                >
                  {event.label}
                </Text>
                {event.detail && (
                  <Text
                    style={{ fontSize: 12, color: colors.label, marginTop: 2 }}
                  >
                    {event.detail}
                  </Text>
                )}
                <Text style={{ fontSize: 11, color: colors.teal, marginTop: 5, fontWeight: "600" }}>
                  {formatTimestamp(event.timestamp)}
                </Text>
              </View>
            </View>
          </View>
        );
      })}

      <View className="h-4" />
    </ScrollView>
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
