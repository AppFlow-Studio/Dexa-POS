import KanbanColumn from "@/components/online-orders/KanbanColumn";
import type { OnlineColumnVariant } from "@/components/online-orders/OnlineOrderCard";
import { startInteraction } from "@/lib/perf";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import {
  useOnlineOrders,
  usePendingOnlineOrderCount,
} from "@/stores/selectors/orderSelectors";
import { Link } from "expo-router";
import { Table } from "lucide-react-native";
import { useMemo, useState } from "react";
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
  const uiScale = useUiScale();
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
    <View
      style={{
        flex: 1,
        backgroundColor: colors.screen,
        paddingHorizontal: 16 * uiScale,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          marginVertical: 12 * uiScale,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12 * uiScale,
          }}
        >
          {pendingCount > 0 && (
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: colors.teal,
              }}
            >
              <Text
                style={{
                  color: colors.onSolid,
                  fontSize: 14 * uiScale,
                  fontWeight: "700",
                }}
              >
                {pendingCount} new
              </Text>
            </View>
          )}
        </View>
        <Link href="/order-processing" asChild>
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.panel,
              borderRadius: Math.round(12 * uiScale),
              borderWidth: 1,
              borderColor: colors.border,
              padding: Math.round(12 * uiScale),
            }}
          >
            <Table color={colors.label} size={Math.round(20 * uiScale)} />
          </TouchableOpacity>
        </Link>
      </View>

      <View
        style={{
          flex: 1,
          flexDirection: "row",
          gap: Math.round(16 * uiScale),
          paddingBottom: Math.round(16 * uiScale),
        }}
      >
        {renderKanbanView()}
      </View>
    </View>
  );
};

export default OnlineOrdersScreen;
