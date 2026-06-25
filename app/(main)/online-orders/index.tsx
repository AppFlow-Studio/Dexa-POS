import KanbanColumn from "@/components/online-orders/KanbanColumn";
import type { OnlineColumnVariant } from "@/components/online-orders/OnlineOrderCard";
import { startInteraction } from "@/lib/perf";
import { colors } from "@/lib/theme";
import {
  useOnlineOrders,
  usePendingOnlineOrderCount,
} from "@/stores/selectors/orderSelectors";
import { Link } from "expo-router";
import { Table } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

type ColumnKey = "new" | "kitchen" | "ready" | "done";

const COLUMNS: {
  key: ColumnKey;
  title: string;
  color: string;
  variant: OnlineColumnVariant;
}[] = [
  { key: "new", title: "New Orders", color: "#3b82f6", variant: "new" },
  { key: "kitchen", title: "In Kitchen", color: "#ef4444", variant: "kitchen" },
  { key: "ready", title: "Ready", color: "#a855f7", variant: "ready" },
  { key: "done", title: "Done", color: "#22c55e", variant: "done" },
];

const OnlineOrdersScreen = () => {
  const [focusedColumn, setFocusedColumn] = useState<ColumnKey | null>(null);

  const onlineOrders = useOnlineOrders();
  const pendingCount = usePendingOnlineOrderCount();

  const focusColumn = (key: ColumnKey | null) => {
    const span = startInteraction("pos.kanban_focus_column");
    setFocusedColumn(key);
    span.endAfterPaint();
  };

  // Bucket the (already-stable) online orders into column key-lists. Cards
  // subscribe to their own order via the key, so this grouping is the only
  // per-board work and it's a single linear pass.
  const buckets = useMemo(() => {
    const next: Record<ColumnKey, string[]> = {
      new: [],
      kitchen: [],
      ready: [],
      done: [],
    };
    for (const o of onlineOrders) {
      const key = o.db_order_id ?? o.id;
      switch (o.order_status) {
        case "pending":
          next.new.push(key);
          break;
        case "accepted":
        case "sent_to_kitchen":
        case "preparing":
          next.kitchen.push(key);
          break;
        case "ready":
          next.ready.push(key);
          break;
        case "completed":
          next.done.push(key);
          break;
      }
    }
    return next;
  }, [onlineOrders]);

  const renderKanbanView = () => {
    if (focusedColumn) {
      const col = COLUMNS.find((c) => c.key === focusedColumn);
      if (!col) return null;
      return (
        <KanbanColumn
          key={col.key}
          title={col.title}
          color={col.color}
          orderIds={buckets[col.key]}
          variant={col.variant}
          isFocused
          onHeaderPress={() => focusColumn(null)}
        />
      );
    }

    return COLUMNS.map((col) => (
      <KanbanColumn
        key={col.key}
        title={col.title}
        color={col.color}
        orderIds={buckets[col.key]}
        variant={col.variant}
        isFocused={false}
        onHeaderPress={() => focusColumn(col.key)}
      />
    ));
  };

  return (
    <View className="flex-1 px-4 bg-screen">
      <View className="flex-row items-center justify-between my-3">
        <View className="flex-row items-center gap-x-3">
          <Text className="text-2xl font-bold text-heading">Online Orders</Text>
          {pendingCount > 0 && (
            <View className="px-2.5 py-1 rounded-full bg-blue-500">
              <Text className="text-white text-sm font-bold">
                {pendingCount} new
              </Text>
            </View>
          )}
        </View>
        <Link href="/order-processing" asChild>
          <TouchableOpacity className="flex-row items-center bg-panel rounded-xl border border-border p-3">
            <Table color={colors.label} size={20} />
          </TouchableOpacity>
        </Link>
      </View>

      <View className="flex-1 flex-row gap-x-4 pb-4">{renderKanbanView()}</View>
    </View>
  );
};

export default OnlineOrdersScreen;
