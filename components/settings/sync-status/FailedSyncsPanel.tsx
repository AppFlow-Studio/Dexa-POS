/**
 * FailedSyncsPanel — Displays dead-lettered sync operations that exhausted retries.
 *
 * Shows operation type, timestamp, and allows manual retry or discard.
 * Integrates with offlineSyncService dead letter queue.
 */

import { colors } from "@/lib/theme";
import {
  discardDeadLetterOperation,
  getDeadLetterOperations,
  retryDeadLetterOperation,
  type OfflineOperation,
} from "@/services/offlineSyncService";
import {
  AlertTriangle,
  RefreshCw,
  Trash2,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const OPERATION_LABELS: Record<string, string> = {
  create_order: "Create Order",
  add_item: "Add Item",
  update_item: "Update Item",
  update_item_quantity: "Update Quantity",
  replace_modifiers: "Replace Modifiers",
  remove_item: "Remove Item",
  void_item: "Void Item",
  update_order_status: "Update Order Status",
  apply_discount: "Apply Discount",
  void_discount: "Void Discount",
  send_to_kitchen: "Send to Kitchen",
  process_payment: "Process Payment",
  process_cash_payment: "Cash Payment",
  process_card_payment: "Card Payment",
  seat_guests: "Seat Guests",
  update_session_status: "Update Session",
  link_order_to_session: "Link Order to Session",
  close_check: "Close Check",
  reopen_check: "Reopen Check",
  fire_course: "Fire Course",
  record_cash_drawer_operation: "Cash Drawer",
  process_preauth: "Pre-Auth",
  capture_preauth: "Capture Pre-Auth",
  increment_preauth: "Increment Pre-Auth",
  void_preauth: "Void Pre-Auth",
};

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function isPaymentOp(type: string): boolean {
  return [
    "process_payment",
    "process_cash_payment",
    "process_card_payment",
    "process_preauth",
    "capture_preauth",
    "increment_preauth",
    "void_preauth",
  ].includes(type);
}

export function FailedSyncsPanel(): React.ReactElement {
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    setOperations(getDeadLetterOperations());
  }, []);

  useEffect(() => {
    refresh();
    // Refresh every 10 seconds in case the queue changes
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleRetry = async (opId: string) => {
    setRetryingIds((prev) => new Set(prev).add(opId));
    try {
      await retryDeadLetterOperation(opId);
      refresh();
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(opId);
        return next;
      });
    }
  };

  const handleDiscard = (opId: string) => {
    discardDeadLetterOperation(opId);
    refresh();
  };

  const handleRetryAll = async () => {
    const ids = operations.map((op) => op.id);
    setRetryingIds(new Set(ids));
    try {
      for (const id of ids) {
        await retryDeadLetterOperation(id);
      }
      refresh();
    } finally {
      setRetryingIds(new Set());
    }
  };

  if (operations.length === 0) {
    return (
      <View className="p-4 bg-panel rounded-xl border border-gray-700">
        <View className="flex-row items-center gap-2 mb-2">
          <AlertTriangle size={16} color={colors.label} />
          <Text className="text-base font-semibold text-white">
            Failed Sync Operations
          </Text>
        </View>
        <Text className="text-sm text-gray-400">
          No failed operations. All syncs are healthy.
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-panel rounded-xl border border-red-900/50 overflow-hidden">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
        <View className="flex-row items-center gap-2">
          <AlertTriangle size={16} color={colors.danger} />
          <Text className="text-base font-semibold text-white">
            Failed Sync Operations
          </Text>
          <View className="bg-red-900/40 px-2 py-0.5 rounded-full">
            <Text className="text-xs font-bold text-red-400">
              {operations.length}
            </Text>
          </View>
        </View>
        {operations.length > 1 && (
          <TouchableOpacity
            onPress={handleRetryAll}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-900/30"
          >
            <RefreshCw size={12} color={colors.teal} />
            <Text className="text-xs font-medium text-teal-400">Retry All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Operations list */}
      {operations.map((op) => {
        const isRetrying = retryingIds.has(op.id);
        const isPayment = isPaymentOp(op.type);

        return (
          <View
            key={op.id}
            className="flex-row items-center p-4 border-b border-gray-700/50"
          >
            {/* Type + Details */}
            <View className="flex-1 mr-3">
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-semibold text-white">
                  {OPERATION_LABELS[op.type] || op.type}
                </Text>
                {isPayment && (
                  <View className="bg-red-900/40 px-1.5 py-0.5 rounded">
                    <Text className="text-[10px] font-bold text-red-400">
                      PAYMENT
                    </Text>
                  </View>
                )}
              </View>
              <Text className="text-xs text-gray-400 mt-0.5">
                {formatTimestamp(op.timestamp)} · {op.retryCount} retries
              </Text>
              {op.localOrderId && (
                <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
                  Order: {op.localOrderId.substring(0, 20)}...
                </Text>
              )}
            </View>

            {/* Action buttons */}
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                onPress={() => handleRetry(op.id)}
                disabled={isRetrying}
                className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-900/30"
              >
                {isRetrying ? (
                  <ActivityIndicator size="small" color={colors.teal} />
                ) : (
                  <RefreshCw size={12} color={colors.teal} />
                )}
                <Text className="text-xs font-medium text-teal-400">Retry</Text>
              </TouchableOpacity>

              {!isPayment && (
                <TouchableOpacity
                  onPress={() => handleDiscard(op.id)}
                  className="flex-row items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-800"
                >
                  <Trash2 size={12} color={colors.label} />
                  <Text className="text-xs font-medium text-gray-400">
                    Discard
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}

      {/* Footer warning for payment ops */}
      {operations.some((op) => isPaymentOp(op.type)) && (
        <View className="p-3 bg-red-900/20">
          <Text className="text-xs text-red-300">
            Payment operations cannot be discarded. They must be retried or resolved manually.
          </Text>
        </View>
      )}
    </View>
  );
}
