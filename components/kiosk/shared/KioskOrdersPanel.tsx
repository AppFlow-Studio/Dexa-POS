import { kioskMoney } from "@/components/kiosk/shared/kioskMoney";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { ChevronRight, Receipt, RefreshCw, Search, X } from "@/lib/icons";
import type { EmployeeProfile } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  cleanSearch,
  dateFilterPhrase,
  dayHeading,
  LIST_SELECT,
  orderNumber,
  orderState,
  orderTypeLabel,
  PAGE_SIZE,
  resolveDateRange,
  storeDayOf,
  summarizePayments,
  timeLabel,
  type DateFilter,
  type OrderRow,
} from "./kioskOrders";
import { KioskOrderDetail } from "./KioskOrderDetail";
import { KioskOrdersDateFilter } from "./KioskOrdersDateFilter";
import { Card, ErrorCard, StateCard, StatusPill, TEAL } from "./KioskOrdersUi";
import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

/** Fixed row heights keep FlashList's recycling exact (no re-measure jumps). */
const ROW_HEIGHT = 76;
const DAY_HEIGHT = 36;
const SEARCH_DEBOUNCE_MS = 400;

type ListItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "order"; key: string; order: OrderRow };

/**
 * Kiosk Settings → Orders: this kiosk's orders by date, their payments, and a
 * refund action for staff.
 *
 * Reads only on demand, so it costs the customer-facing kiosk nothing between
 * visits: the panel is mounted only while the section is open, fetches one
 * page for the chosen dates, pages in more as staff scroll, and reads an order
 * only when it's tapped. No polling, no realtime, and `gcTime: 0` drops
 * everything when staff leave the section.
 *
 * One thing at a time: tapping an order replaces the list, and "All orders"
 * brings the list back scrolled to that order. The two are never stacked —
 * on Android the list card's elevation drew it above an overlaid detail and
 * took its scroll gestures.
 */
export function KioskOrdersPanel({ staff }: { staff: EmployeeProfile | null }) {
  const supabase = useSupabaseClient();
  const locationId = useStoreSettingsStore((s) => s.selectedStore?.id);
  const stationId = useStoreSettingsStore((s) => s.selectedStation?.id);

  const [dateFilter, setDateFilter] = useState<DateFilter>({ preset: "today" });
  const range = useMemo(() => resolveDateRange(dateFilter), [dateFilter]);

  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(cleanSearch(searchText)), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchText]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Where the list reopens after "All orders": one row above the order that
  // was opened, so it comes back with a little context above it.
  const returnIndexRef = useRef(0);
  const openOrder = useCallback((id: string, index: number) => {
    returnIndexRef.current = Math.max(0, index - 1);
    setSelectedId(id);
  }, []);

  const ordersQuery = useInfiniteQuery({
    queryKey: ["kioskOrders", "list", stationId, search, range.from, range.to],
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("orders")
        // Count once, on the first page: cheap within one station's date range.
        .select(LIST_SELECT, pageParam === 0 ? { count: "exact" } : undefined)
        .eq("location_id", locationId!)
        .eq("station_id", stationId!)
        .neq("status", "draft")
        .gte("created_at", range.from)
        .lt("created_at", range.to)
        .order("created_at", { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);
      if (search) {
        q = q.or(`display_number.ilike.%${search}%,order_number.ilike.%${search}%`);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as OrderRow[], count };
    },
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.rows.length < PAGE_SIZE ? undefined : pages.length * PAGE_SIZE,
    enabled: !!supabase && !!locationId && !!stationId,
    // Changing dates or search keeps the old list on screen (dimmed) until
    // the new one lands, instead of flashing a spinner.
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { data, hasNextPage, isFetching, isFetchingNextPage, fetchNextPage, refetch } =
    ordersQuery;
  const total = data?.pages[0]?.count ?? null;

  // Day headings only when the range spans more than one day; for a single
  // day the date chip already says which.
  const items = useMemo(() => {
    const out: ListItem[] = [];
    let lastDay = "";
    for (const order of data?.pages.flatMap((p) => p.rows) ?? []) {
      if (range.multiDay) {
        const day = storeDayOf(order.created_at);
        if (day !== lastDay) {
          out.push({ kind: "day", key: `day-${day}`, label: dayHeading(day) });
          lastDay = day;
        }
      }
      out.push({ kind: "order", key: order.id, order });
    }
    return out;
  }, [data, range.multiDay]);

  // Waits out any fetch in flight — including a new filter's first page while
  // the previous list is still showing — so a page is never requested twice
  // or appended to the wrong list.
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetching) fetchNextPage();
  }, [hasNextPage, isFetching, fetchNextPage]);

  const [pulling, setPulling] = useState(false);
  const pullRefresh = useCallback(async () => {
    setPulling(true);
    try {
      await refetch();
    } finally {
      setPulling(false);
    }
  }, [refetch]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ListItem>) =>
      item.kind === "day" ? (
        <DayHeader label={item.label} />
      ) : (
        <OrderListRow order={item.order} index={index} onSelect={openOrder} />
      ),
    [openOrder],
  );

  const busy =
    ordersQuery.isFetching && !pulling && !isFetchingNextPage && !ordersQuery.isPending;
  const summary = ordersQuery.isPlaceholderData
    ? "Loading…"
    : ordersQuery.isError && items.length > 0
      ? "Couldn't refresh. Pull down to try again."
      : total != null
        ? `${total} order${total === 1 ? "" : "s"}${search ? ` matching “${search}”` : ""}`
        : "";

  let listBody: React.ReactNode;
  if (!locationId || !stationId) {
    listBody = (
      <StateCard>
        <Receipt size={28} color="#9CA3AF" />
        <Text className="text-sm text-gray-500 mt-3 text-center">
          {"This kiosk isn't linked to a station yet."}
        </Text>
      </StateCard>
    );
  } else if (ordersQuery.isPending) {
    listBody = (
      <StateCard>
        <ActivityIndicator color={TEAL} />
        <Text className="text-sm text-gray-500 mt-3">Loading orders…</Text>
      </StateCard>
    );
  } else if (ordersQuery.isError && items.length === 0) {
    listBody = (
      <ErrorCard
        message="Couldn't load orders. Check the connection and try again."
        onRetry={() => refetch()}
      />
    );
  } else if (items.length === 0) {
    listBody = (
      <StateCard>
        <Receipt size={28} color="#9CA3AF" />
        <Text className="text-base font-semibold text-gray-700 mt-3 text-center">
          {search
            ? `No order matches “${search}” ${dateFilterPhrase(dateFilter)}`
            : `No orders ${dateFilterPhrase(dateFilter)}`}
        </Text>
        <Text className="text-sm text-gray-400 mt-1 text-center">
          {search
            ? "Check the number on the receipt, or try other dates."
            : "Try other dates."}
        </Text>
      </StateCard>
    );
  } else {
    listBody = (
      <Card className="flex-1">
        <View
          className="flex-1"
          style={{ opacity: ordersQuery.isPlaceholderData ? 0.5 : 1 }}
        >
          <FlashList
            data={items}
            renderItem={renderItem}
            keyExtractor={(item) => item.key}
            getItemType={(item) => item.kind}
            estimatedItemSize={ROW_HEIGHT}
            // Exact sizes, so reopening at an index lands precisely.
            overrideItemLayout={(layout, item) => {
              layout.size = item.kind === "day" ? DAY_HEIGHT : ROW_HEIGHT;
            }}
            initialScrollIndex={returnIndexRef.current || undefined}
            onEndReached={loadMore}
            onEndReachedThreshold={0.6}
            refreshing={pulling}
            onRefresh={pullRefresh}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View className="py-5 items-center">
                  <ActivityIndicator color={TEAL} />
                </View>
              ) : null
            }
          />
        </View>
      </Card>
    );
  }

  const listColumn = (
    <View className="flex-1" style={{ gap: 12 }}>
      <View className="flex-row items-center" style={{ gap: 10 }}>
        <View className="flex-1 flex-row items-center bg-white border border-gray-200 rounded-2xl px-4">
          <Search size={18} color="#9CA3AF" />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={() => setSearch(cleanSearch(searchText))}
            placeholder="Search order number"
            placeholderTextColor="#9CA3AF"
            returnKeyType="search"
            autoCapitalize="characters"
            autoCorrect={false}
            className="flex-1 py-3.5 px-3 text-base text-gray-900"
          />
          {searchText ? (
            <Pressable
              onPress={() => {
                setSearchText("");
                setSearch("");
              }}
              hitSlop={10}
              accessibilityLabel="Clear search"
            >
              <X size={18} color="#6B7280" />
            </Pressable>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => refetch()}
          disabled={ordersQuery.isFetching}
          accessibilityLabel="Refresh orders"
          className="w-[52px] h-[52px] rounded-2xl bg-white border border-gray-200 items-center justify-center"
        >
          {busy ? (
            <ActivityIndicator size="small" color={TEAL} />
          ) : (
            <RefreshCw size={20} color={TEAL} />
          )}
        </TouchableOpacity>
      </View>

      <KioskOrdersDateFilter value={dateFilter} onChange={setDateFilter} />

      {summary ? (
        <Text
          className={`text-sm px-1 ${
            ordersQuery.isError && items.length > 0 ? "text-red-600" : "text-gray-500"
          }`}
        >
          {summary}
        </Text>
      ) : null}

      {listBody}
    </View>
  );

  return (
    <View className="flex-1">
      {selectedId ? (
        <KioskOrderDetail
          key={selectedId}
          orderId={selectedId}
          staff={staff}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        listColumn
      )}
    </View>
  );
}

const OrderListRow = memo(function OrderListRow({
  order,
  index,
  onSelect,
}: {
  order: OrderRow;
  index: number;
  onSelect: (id: string, index: number) => void;
}) {
  const { paid } = summarizePayments(order.order_payments);
  const meta = [
    timeLabel(order.created_at),
    orderTypeLabel(order.order_type),
    order.customer_name,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <TouchableOpacity
      onPress={() => onSelect(order.id, index)}
      activeOpacity={0.6}
      accessibilityRole="button"
      style={{ height: ROW_HEIGHT }}
      className="flex-row items-center px-5 border-b border-gray-100 bg-white"
    >
      <View className="flex-1 pr-3">
        <Text className="text-base font-bold text-gray-900" numberOfLines={1}>
          {orderNumber(order)}
        </Text>
        <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View className="items-end" style={{ gap: 4 }}>
        <Text className="text-base font-bold text-gray-900">
          {kioskMoney(paid > 0 ? paid : (order.total_amount ?? 0))}
        </Text>
        <StatusPill {...orderState(order)} />
      </View>
      <View className="ml-2">
        <ChevronRight size={20} color="#D1D5DB" />
      </View>
    </TouchableOpacity>
  );
});

function DayHeader({ label }: { label: string }) {
  return (
    <View
      style={{ height: DAY_HEIGHT }}
      className="justify-center px-5 bg-gray-50 border-b border-gray-100"
    >
      <Text className="text-xs font-bold text-gray-500 uppercase tracking-wide">
        {label}
      </Text>
    </View>
  );
}
