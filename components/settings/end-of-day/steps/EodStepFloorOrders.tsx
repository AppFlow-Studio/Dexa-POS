import { ChecklistItem, ChecklistItemId, OpenOrderSummary } from "@/stores/useEndOfDayStore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import EodChecklistRow from "../EodChecklistRow";

const resolveItem = (
  list: ChecklistItem[],
  id: ChecklistItemId
): ChecklistItem | undefined => list.find((i) => i.id === id);

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function paymentStatusLabel(status: string): string {
  switch (status) {
    case "partial": return "Partial";
    case "partially_refunded": return "Part. Refund";
    case "refunded": return "Refunded";
    case "pending": return "Unpaid";
    default: return "Unpaid";
  }
}

interface EodStepFloorOrdersProps {
  checklist: ChecklistItem[];
  isRunning: boolean;
  onRefresh: () => Promise<void> | void;
  onOpenTables: () => void;
  onOpenOrders: () => void;
  openOrders: OpenOrderSummary[];
  isBulkClosing: boolean;
  onBulkClose: (orderIds: string[]) => Promise<void>;
  onNavigateToOrder: (orderId: string) => void;
  onPayOrder: (orderId: string) => Promise<void>;
}

export default function EodStepFloorOrders({
  checklist,
  isRunning,
  onRefresh,
  onOpenTables,
  onOpenOrders,
  openOrders,
  isBulkClosing,
  onBulkClose,
  onNavigateToOrder,
  onPayOrder,
}: EodStepFloorOrdersProps) {
  const tablesItem = resolveItem(checklist, "tables_clear");
  const ordersItem = resolveItem(checklist, "orders_closed");

  const isPassed =
    tablesItem?.status === "passed" && ordersItem?.status === "passed";

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Clear selection when orders list refreshes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [openOrders.length]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasSelection = selectedIds.size > 0;
  const isDisabled = isRunning || isBulkClosing;

  const handleCloseAll = () => {
    void onBulkClose(openOrders.map((o) => o.id));
  };

  const handleCloseSelected = () => {
    void onBulkClose([...selectedIds]);
  };

  return (
    <View className="gap-4">
      <View className="rounded-xl border border-gray-700 bg-panel p-4">
        <Text className="text-sm text-zinc-200">
          Confirm every occupied table is clear and every unpaid order has
          either been paid, voided, or closed.
        </Text>
        <TouchableOpacity
          onPress={() => void onRefresh()}
          className="mt-3 self-start rounded-lg bg-cyan-500/20 px-3 py-2"
          disabled={isDisabled}
        >
          <Text className="text-xs font-semibold text-cyan-200">
            Refresh status
          </Text>
        </TouchableOpacity>
      </View>

      <EodChecklistRow
        title="Floor status"
        description={tablesItem?.description}
        status={tablesItem?.status || "pending"}
        detail={tablesItem?.detail}
        actionLabel="Go to tables"
        onPress={onOpenTables}
      />
      <EodChecklistRow
        title="Order closure"
        description={ordersItem?.description}
        status={ordersItem?.status || "pending"}
        detail={ordersItem?.detail}
        actionLabel="Go to orders"
        onPress={onOpenOrders}
      />

      {openOrders.length > 0 && (
        <View className="rounded-xl border border-gray-700 bg-panel overflow-hidden">
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-700">
            <Text className="text-sm font-semibold text-zinc-200">
              Open Orders ({openOrders.length})
            </Text>
            <View className="flex-row gap-2">
              {hasSelection && (
                <TouchableOpacity
                  onPress={handleCloseSelected}
                  disabled={isDisabled}
                  className="rounded-lg bg-amber-500/20 px-3 py-1.5"
                >
                  <Text className="text-xs font-semibold text-amber-200">
                    Close ({selectedIds.size})
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleCloseAll}
                disabled={isDisabled}
                className="rounded-lg bg-rose-500/20 px-3 py-1.5"
              >
                <Text className="text-xs font-semibold text-rose-300">
                  Close All
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Order rows */}
          {openOrders.map((order, index) => {
            const isSelected = selectedIds.has(order.id);
            const label = order.table_number
              ? `Table ${order.table_number}`
              : (order.order_type ?? "Walk-up");

            return (
              <View
                key={order.id}
                className={`flex-row items-center px-4 py-3 gap-3 ${
                  index < openOrders.length - 1 ? "border-b border-gray-700/50" : ""
                }`}
              >
                {/* Checkbox */}
                <TouchableOpacity
                  onPress={() => toggleSelect(order.id)}
                  disabled={isDisabled}
                  className={`w-5 h-5 rounded border items-center justify-center ${
                    isSelected
                      ? "bg-cyan-500 border-cyan-500"
                      : "border-gray-500"
                  }`}
                >
                  {isSelected && (
                    <Text className="text-xs font-bold text-black">✓</Text>
                  )}
                </TouchableOpacity>

                {/* Order info */}
                <View className="flex-1">
                  <Text className="text-sm font-medium text-zinc-200">
                    {label}
                  </Text>
                  <View className="flex-row gap-2 mt-0.5">
                    <Text className="text-xs text-zinc-400">
                      {formatDate(order.created_at)}
                    </Text>
                    <Text className="text-xs text-zinc-500">·</Text>
                    <Text className="text-xs text-zinc-400">
                      {paymentStatusLabel(order.payment_status)}
                    </Text>
                  </View>
                </View>

                {/* Amount */}
                <Text className="text-sm font-semibold text-zinc-200 mr-2">
                  {formatCurrency(order.grand_total)}
                </Text>

                {/* Actions */}
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => onNavigateToOrder(order.id)}
                    disabled={isDisabled}
                    className="rounded-lg bg-zinc-700/60 px-2.5 py-1.5"
                  >
                    <Text className="text-xs font-medium text-zinc-300">Go</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void onPayOrder(order.id)}
                    disabled={isDisabled}
                    className="rounded-lg bg-cyan-500/20 px-2.5 py-1.5"
                  >
                    <Text className="text-xs font-medium text-cyan-200">Pay</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {/* Bulk close loading overlay */}
          {isBulkClosing && (
            <View className="absolute inset-0 bg-black/50 items-center justify-center rounded-xl">
              <ActivityIndicator color="#22d3ee" />
              <Text className="text-xs text-cyan-300 mt-2">Closing orders…</Text>
            </View>
          )}
        </View>
      )}

      <View className="rounded-xl border border-gray-700 bg-emerald-900/20 p-3">
        <Text className="text-sm font-semibold text-emerald-200">
          {isPassed
            ? "Floor and orders checks are complete."
            : "This step resolves when both checks are passing."}
        </Text>
      </View>
    </View>
  );
}
