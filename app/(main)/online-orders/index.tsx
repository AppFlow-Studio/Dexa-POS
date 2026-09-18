import KanbanColumn from "@/components/online-orders/KanbanColumn";
import type { OnlineColumnVariant } from "@/components/online-orders/OnlineOrderCard";
import OnlineOrderDateFilter from "@/components/online-orders/OnlineOrderDateFilter";
import {
  useOnlineOrdersByDate,
  type OnlineOrderDateFilter as DateFilter,
} from "@/hooks/orders/useOnlineOrdersByDate";
import { startInteraction } from "@/lib/perf";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { usePendingOnlineOrderCount } from "@/stores/selectors/orderSelectors";
import { Link } from "expo-router";
import { Table } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

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
  const [dateFilter, setDateFilter] = useState<DateFilter>({
    preset: "today",
    startDate: null,
    endDate: null,
  });

  const pendingCount = usePendingOnlineOrderCount();
  const {
    onlineOrders,
    isLoading: isFetching,
    error: fetchError,
    source: boardSource,
  } = useOnlineOrdersByDate(dateFilter);

  const focusColumn = (key: ColumnKey | null) => {
    const span = startInteraction("pos.kanban_focus_column");
    setFocusedColumn(key);
    span.endAfterPaint();
  };

  const handleDateFilterChange = useCallback((filter: DateFilter) => {
    setDateFilter(filter);
  }, []);

  // Bucket the online orders into column key-lists.
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
    console.log(
      "[online-orders] buckets: new=",
      next.new.length,
      "kitchen=",
      next.kitchen.length,
      "ready=",
      next.ready.length,
      "done=",
      next.done.length,
      "new:",
      next.new.map((k) => k.slice(-6)).join(","),
      "kitchen:",
      next.kitchen.map((k) => k.slice(-6)).join(","),
    );
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
      {/* Top bar: date filter on the left, pending badge + table link on the right */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginVertical: 12 * uiScale,
        }}
      >
        {/* Date filter pills */}
        <OnlineOrderDateFilter
          value={dateFilter}
          onChange={handleDateFilterChange}
        />

        {/* Right-side actions */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12 * uiScale,
          }}
        >
          {isFetching && <ActivityIndicator size="small" color={colors.teal} />}
          {pendingCount > 0 && (
            <View
              style={{
                paddingHorizontal: Math.round(10 * uiScale),
                paddingVertical: Math.round(4 * uiScale),
                borderRadius: 999,
                backgroundColor: colors.teal,
              }}
            >
              <Text
                style={{
                  color: colors.onSolid,
                  fontSize: Math.round(14 * uiScale),
                  fontWeight: "700",
                }}
              >
                {pendingCount} new
              </Text>
            </View>
          )}
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
      </View>

      {/* Scope line — the board is rendering from this device's mirror because
          the server could not be reached. Said plainly rather than left to
          look like a complete board: an operator deciding whether an order
          arrived needs to know which question was actually answered. */}
      {boardSource === "local" && (
        <View
          style={{
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: Math.round(12 * uiScale),
            paddingVertical: Math.round(8 * uiScale),
            borderRadius: Math.round(8 * uiScale),
            marginBottom: Math.round(8 * uiScale),
          }}
        >
          <Text
            style={{ color: colors.label, fontSize: Math.round(13 * uiScale) }}
          >
            Offline — showing the orders this device has synced. New orders
            will appear when the connection returns.
          </Text>
        </View>
      )}

      {/* Error banner */}
      {fetchError && (
        <View
          style={{
            backgroundColor: colors.danger + "18",
            paddingHorizontal: Math.round(12 * uiScale),
            paddingVertical: Math.round(8 * uiScale),
            borderRadius: Math.round(8 * uiScale),
            marginBottom: Math.round(8 * uiScale),
          }}
        >
          <Text
            style={{ color: colors.danger, fontSize: Math.round(13 * uiScale) }}
          >
            {fetchError}
          </Text>
        </View>
      )}

      {/* Kanban columns */}
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
