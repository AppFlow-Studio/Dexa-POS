import KanbanColumn from "@/components/online-orders/KanbanColumn";
import type { OnlineColumnVariant } from "@/components/online-orders/OnlineOrderCard";
import OnlineOrderDateFilter from "@/components/online-orders/OnlineOrderDateFilter";
import type { OnlineOrderDateFilter as DateFilter } from "@/hooks/orders/useOnlineOrdersByDate";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { startInteraction } from "@/lib/perf";
import { colors } from "@/lib/theme";
import type { OrderProfile } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { OrderService } from "@/services/orderService";
import {
  useOnlineOrders,
  usePendingOnlineOrderCount,
} from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  normalizeFetchedOrder,
  transformBroadcastToOrder,
  type FetchedOrderData,
} from "@/utils/orderTransformers";
import { Link } from "expo-router";
import { Table } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  // ---- Live orders from the Zustand store (proven, stable selector) ----
  const liveOrders = useOnlineOrders();
  const pendingCount = usePendingOnlineOrderCount();

  // ---- Historical orders for past-date views ----
  const supabase = useSupabaseClient();
  const locationId = useStoreSettingsStore((s) => s.selectedStore?.id ?? null);
  // For past dates, track the IDs we fetched so we can pull the latest
  // data from the Zustand store (which gets updated by patchOrder / sync).
  const [historicalIds, setHistoricalIds] = useState<string[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  const needsFetch = dateFilter.preset !== "today";

  useEffect(() => {
    if (!needsFetch || !supabase || !locationId) {
      setHistoricalIds([]);
      return;
    }

    let cancelled = false;
    const fetchId = ++fetchIdRef.current;
    setIsFetching(true);
    setFetchError(null);

    (async () => {
      try {
        const bounds = await OrderService.getBusinessDayBounds(
          supabase,
          locationId,
          dateFilter.startDate,
          dateFilter.endDate,
        );
        if (cancelled || fetchId !== fetchIdRef.current) return;
        if (!bounds) return;

        // Query online_orders and join to orders via FK — catches ALL online
        // orders regardless of what value is in orders.order_source.
        let q = supabase
          .from("online_orders")
          .select(
            `order_id,
             orders!inner(
               *,
               order_items(*, order_item_modifiers(*)),
               order_payments(*),
               order_discounts(*),
               stations(station_name),
               created_by_staff:staff_profiles!created_by_staff_id(first_name, last_name)
             )`,
          )
          .eq("location_id", locationId)
          .limit(200);

        // Note: date-range filtering + ordering done client-side below.
        // PostgREST dot-notation (orders.created_at) is not reliable
        // across .order() / .gte() / .lt() on embedded resources.

        const { data, error: qError } = await q;
        if (cancelled || fetchId !== fetchIdRef.current) return;

        if (qError) {
          setFetchError(qError.message);
          return;
        }

        const EXCLUDED = new Set([
          "declined",
          "cancelled",
          "void",
          "voided",
          "refunded",
        ]);
        const orders = ((data ?? []) as unknown[])
          .map((row: any) => {
            // Unwrap: query from online_orders returns { order_id, orders: {...} }
            const n = normalizeFetchedOrder(row.orders as FetchedOrderData);
            return transformBroadcastToOrder(n);
          })
          .filter((o) => !EXCLUDED.has(o.order_status ?? ""))
          // Client-side date window (dot-notation not reliable in PostgREST)
          .filter((o) => {
            if (!bounds) return true;
            const t = o.opened_at ? new Date(o.opened_at).getTime() : 0;
            if (bounds.start_ts && t < new Date(bounds.start_ts).getTime())
              return false;
            if (bounds.end_ts && t >= new Date(bounds.end_ts).getTime())
              return false;
            return true;
          });

        // Seed into Zustand store so useOrder(orderId) inside OnlineOrderCard
        // can find these and patchOrder updates are reflected immediately.
        const state = useOrderStore.getState();
        const patch: Record<string, OrderProfile> = {};
        const ids: string[] = [];
        for (const o of orders) {
          const key = o.db_order_id ?? o.id;
          if (key && !state.ordersById[key]) {
            patch[key] = o;
          }
          ids.push(key);
        }
        if (Object.keys(patch).length > 0) {
          useOrderStore.setState({
            ordersById: { ...state.ordersById, ...patch },
          });
        }

        // Track IDs only — the store is the source of truth.
        setHistoricalIds(ids);
      } catch (e: any) {
        if (!cancelled && fetchId === fetchIdRef.current) {
          setFetchError(e?.message ?? "Failed to fetch");
        }
      } finally {
        if (!cancelled && fetchId === fetchIdRef.current) {
          setIsFetching(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    needsFetch,
    supabase,
    locationId,
    dateFilter.startDate,
    dateFilter.endDate,
  ]);

  // ---- Assemble the final order list ----
  // Today: useOnlineOrders() is the single source of truth.
  // Past dates: liveOrders (store-driven) + historical IDs pulled from
  // the store so patchOrder / sync updates are reflected immediately.
  const ordersByIdFromStore = useOrderStore((s) => s.ordersById);

  const onlineOrders: OrderProfile[] = (() => {
    if (!needsFetch) {
      console.log(
        "[online-orders] today: liveOrders.length=",
        liveOrders.length,
        "statuses=",
        liveOrders
          .map((o) => `${(o.db_order_id ?? o.id).slice(-6)}:${o.order_status}`)
          .join(", "),
      );
      return liveOrders;
    }

    const seen = new Set<string>();
    const merged: OrderProfile[] = [];
    for (const o of liveOrders) {
      seen.add(o.db_order_id ?? o.id);
      merged.push(o);
    }
    // Pull latest data from the store (not stale useState snapshot)
    for (const id of historicalIds) {
      if (seen.has(id)) continue;
      const o = ordersByIdFromStore[id];
      if (o) {
        seen.add(id);
        merged.push(o);
      }
    }
    merged.sort(
      (a, b) =>
        new Date(b.opened_at ?? 0).getTime() -
        new Date(a.opened_at ?? 0).getTime(),
    );
    console.log(
      "[online-orders] merged: live=",
      liveOrders.length,
      "historicalIds=",
      historicalIds.length,
      "merged=",
      merged.length,
    );
    return merged;
  })();

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

      {/* Error banner */}
      {fetchError && (
        <View
          style={{
            backgroundColor: colors.danger + "18",
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: colors.danger, fontSize: 13 }}>
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
