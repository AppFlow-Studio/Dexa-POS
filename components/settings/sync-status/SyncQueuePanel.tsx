/**
 * SyncQueuePanel — Displays queued offline sync operations and allows manual flush.
 *
 * Shows operation type, status, timestamp, retry count, and provides
 * "Sync Now" and "Force Retry All" actions. Polls every 5 seconds.
 */

import { colors } from "@/lib/theme";
import {
  forceRetryAllPending,
  getIsOnline,
  getPendingOperations,
  getQueueStatus,
  processQueueNow,
  type OfflineOperation,
} from "@/services/offlineSyncService";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  RotateCcw,
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

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-yellow-900/40", text: "text-yellow-400", label: "Pending" },
  processing: { bg: "bg-blue-900/40", text: "text-blue-400", label: "Processing" },
  blocked: { bg: "bg-orange-900/40", text: "text-orange-400", label: "Blocked" },
  failed: { bg: "bg-red-900/40", text: "text-red-400", label: "Failed" },
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

export function SyncQueuePanel(): React.ReactElement {
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [queueStatus, setQueueStatus] = useState<ReturnType<typeof getQueueStatus> | null>(null);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [forceRetrying, setForceRetrying] = useState(false);

  const refresh = useCallback(() => {
    setOperations(getPendingOperations());
    setQueueStatus(getQueueStatus());
    setOnline(getIsOnline());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const beforeCount = operations.length;
      await processQueueNow({ force: true });
      refresh();
      const afterCount = getPendingOperations().length;
      if (afterCount > 0 && afterCount >= beforeCount) {
        console.warn("[SyncQueuePanel] Sync completed but operations remain:", afterCount);
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleForceRetry = async () => {
    setForceRetrying(true);
    try {
      await forceRetryAllPending();
      refresh();
    } finally {
      setForceRetrying(false);
    }
  };

  const hasStuckOps = queueStatus != null && (queueStatus.processing > 0 || queueStatus.blocked > 0);

  // Empty state
  if (operations.length === 0) {
    return (
      <View className="p-4 bg-panel rounded-xl border border-gray-700">
        <View className="flex-row items-center gap-2 mb-2">
          <Cloud size={16} color={colors.teal} />
          <Text className="text-base font-semibold text-white">
            Sync Queue
          </Text>
          <View className="bg-gray-700/60 px-2 py-0.5 rounded-full">
            <Text className="text-xs font-bold text-gray-400">0</Text>
          </View>
        </View>
        <Text className="text-sm text-gray-400">
          Queue is empty. All operations synced.
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-panel rounded-xl border border-teal-900/50 overflow-hidden">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
        <View className="flex-row items-center gap-2">
          <Cloud size={16} color={colors.teal} />
          <Text className="text-base font-semibold text-white">
            Sync Queue
          </Text>
          <View className="bg-teal-900/40 px-2 py-0.5 rounded-full">
            <Text className="text-xs font-bold text-teal-400">
              {operations.length}
            </Text>
          </View>
        </View>

        {/* Online/Offline indicator */}
        <View className="flex-row items-center gap-1.5">
          {online ? (
            <>
              <Cloud size={12} color="#22c55e" />
              <Text className="text-xs text-green-400">Online</Text>
            </>
          ) : (
            <>
              <CloudOff size={12} color="#f97316" />
              <Text className="text-xs text-orange-400">Offline</Text>
            </>
          )}
        </View>
      </View>

      {/* Status summary */}
      {queueStatus != null && (
        <View className="flex-row items-center gap-2 px-4 py-2.5 border-b border-gray-700/50">
          {queueStatus.pending > 0 && (
            <View className="bg-yellow-900/40 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] font-bold text-yellow-400">
                {queueStatus.pending} Pending
              </Text>
            </View>
          )}
          {queueStatus.processing > 0 && (
            <View className="bg-blue-900/40 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] font-bold text-blue-400">
                {queueStatus.processing} Processing
              </Text>
            </View>
          )}
          {queueStatus.blocked > 0 && (
            <View className="bg-orange-900/40 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] font-bold text-orange-400">
                {queueStatus.blocked} Blocked
              </Text>
            </View>
          )}
          {queueStatus.failed > 0 && (
            <View className="bg-red-900/40 px-2 py-0.5 rounded-full">
              <Text className="text-[10px] font-bold text-red-400">
                {queueStatus.failed} Failed
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Operations list */}
      {operations.map((op) => {
        const statusStyle = STATUS_COLORS[op.status] ?? STATUS_COLORS.pending;

        return (
          <View
            key={op.id}
            className="flex-row items-center p-4 border-b border-gray-700/50"
          >
            <View className="flex-1 mr-3">
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-semibold text-white">
                  {OPERATION_LABELS[op.type] || op.type}
                </Text>
                <View className={`${statusStyle.bg} px-1.5 py-0.5 rounded`}>
                  <Text className={`text-[10px] font-bold ${statusStyle.text}`}>
                    {statusStyle.label.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text className="text-xs text-gray-400 mt-0.5">
                {formatTimestamp(op.timestamp)}
                {op.retryCount > 0 ? ` · ${op.retryCount} retries` : ""}
              </Text>
              {op.localOrderId && (
                <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
                  Order: {op.localOrderId.substring(0, 20)}...
                </Text>
              )}
            </View>
          </View>
        );
      })}

      {/* Action buttons footer */}
      <View className="flex-row items-center justify-end gap-2 p-3">
        {hasStuckOps && (
          <TouchableOpacity
            onPress={handleForceRetry}
            disabled={forceRetrying}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-900/30"
          >
            {forceRetrying ? (
              <ActivityIndicator size="small" color="#f97316" />
            ) : (
              <RotateCcw size={12} color="#f97316" />
            )}
            <Text className="text-xs font-medium text-orange-400">
              Force Retry All
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleSyncNow}
          disabled={syncing}
          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-900/30"
        >
          {syncing ? (
            <ActivityIndicator size="small" color={colors.teal} />
          ) : (
            <RefreshCw size={12} color={colors.teal} />
          )}
          <Text className="text-xs font-medium text-teal-400">Sync Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
