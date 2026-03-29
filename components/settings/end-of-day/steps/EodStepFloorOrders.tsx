import { ChecklistItem, ChecklistItemId, OpenOrderSummary } from "@/stores/useEndOfDayStore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import EodChecklistRow from "../EodChecklistRow";
import { colors } from "@/lib/theme";


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
    <View style={{ gap: 12 }}>
      <View
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 12,
        }}
      >
        <Text style={{ fontSize: 13, color: colors.label }}>
          Confirm every occupied table is clear and every unpaid order has either
          been paid, voided, or closed in previous orders.
        </Text>
        <TouchableOpacity
          onPress={() => void onRefresh()}
          style={{
            marginTop: 10,
            borderRadius: 8,
            backgroundColor: colors.teal + "20",
            borderWidth: 1,
            borderColor: colors.teal + "50",
            paddingHorizontal: 10,
            paddingVertical: 8,
          }}
          disabled={isRunning}
        >
          <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>
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

      <View
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.success + "50",
          backgroundColor: colors.success + "15",
          padding: 10,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.success }}>
          {isPassed
            ? "Floor and orders checks are complete."
            : "This step resolves when both checks are passing."}
        </Text>
      </View>
    </View>
  );
}
