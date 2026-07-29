import {
    buildProviderRosterFromSummaries,
    countChannelsFromSummaries,
    countProvidersFromSummaries,
    type ChannelTab,
    type ProviderKey,
    type SortKey,
    type StatusFilter,
} from "@/lib/previousOrdersFilters";
import {
    HISTORY_PAGE_SIZE,
    usePreviousOrdersStore,
} from "@/stores/usePreviousOrdersStore";
import { useCallback, useEffect, useState } from "react";

/** Idle time after the last keystroke before a search hits the server. */
const SEARCH_DEBOUNCE_MS = 350;

export type ProviderFilterValue = "all" | ProviderKey;

/**
 * Everything a Previous Orders surface needs to drive the server-side filter,
 * count and pagination state — minus any opinion about layout.
 *
 * Both surfaces (the full screen and the menu section) show the same orders
 * from the same store, so the filter semantics have to match exactly or the two
 * disagree about what "Online" means and which orders a tab holds. Sharing the
 * wiring here is what keeps them honest; each screen still renders its own
 * controls and rows.
 */
export function useHistoryFilterControls() {
  const filters = usePreviousOrdersStore((s) => s.filters);
  const setFilters = usePreviousOrdersStore((s) => s.setFilters);
  const windowSummaries = usePreviousOrdersStore((s) => s.windowSummaries);
  const totalMatchingCount = usePreviousOrdersStore(
    (s) => s.totalMatchingCount,
  );
  const pageIndex = usePreviousOrdersStore((s) => s.pageIndex);
  const pageCount = usePreviousOrdersStore((s) => s.pageCount);
  const isPageLoading = usePreviousOrdersStore((s) => s._isPageLoading);
  const goToPage = usePreviousOrdersStore((s) => s.goToPage);
  const loadedCount = usePreviousOrdersStore((s) => s.previousOrders.length);

  const channelTab = filters.channel as ChannelTab;
  const providerFilter = filters.provider as ProviderFilterValue;
  const statusFilter = filters.status as StatusFilter;
  const sortKey = filters.sort as SortKey;

  // Local state drives the text input so typing stays responsive; only the
  // settled value reaches the store, since every committed change clears the
  // list and refetches.
  const [searchText, setSearchText] = useState(filters.search);

  // Keep the input in step when the store's search is reset from elsewhere
  // (screen teardown, filter clear) rather than by typing.
  useEffect(() => {
    setSearchText((current) =>
      current === filters.search ? current : filters.search,
    );
  }, [filters.search]);

  useEffect(() => {
    if (searchText === filters.search) return;
    const timer = setTimeout(
      () => setFilters({ search: searchText }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchText, filters.search, setFilters]);

  // Leaving the Online tab drops the provider filter, so it can never linger as
  // a hidden constraint behind a tab that doesn't show the provider control.
  const selectChannel = useCallback(
    (tab: ChannelTab) => {
      setFilters({
        channel: tab,
        ...(tab !== "online" ? { provider: "all" } : {}),
      });
    },
    [setFilters],
  );

  const selectProvider = useCallback(
    (provider: ProviderFilterValue) => setFilters({ provider }),
    [setFilters],
  );
  const selectStatus = useCallback(
    (status: StatusFilter) => setFilters({ status }),
    [setFilters],
  );
  const selectSort = useCallback(
    (sort: SortKey) => setFilters({ sort }),
    [setFilters],
  );
  const clearFilters = useCallback(
    () => setFilters({ status: "all", provider: "all" }),
    [setFilters],
  );

  // Counts describe the whole date window, not the loaded page. Status and
  // search are already applied to the summary query server-side; channel and
  // provider are the axes being counted, so they're passed as "all" here.
  const channelCounts: Record<ChannelTab, number> = windowSummaries
    ? countChannelsFromSummaries(windowSummaries, "all")
    : { all: 0, online: 0, dine_in: 0, takeout: 0, delivery: 0 };

  const providerCounts = windowSummaries
    ? countProvidersFromSummaries(windowSummaries, "all")
    : {};

  const providerRoster = windowSummaries
    ? buildProviderRosterFromSummaries(windowSummaries)
    : [];

  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) + (providerFilter !== "all" ? 1 : 0);

  const goToPrevPage = useCallback(
    () => void goToPage(pageIndex - 1),
    [goToPage, pageIndex],
  );
  const goToNextPage = useCallback(
    () => void goToPage(pageIndex + 1),
    [goToPage, pageIndex],
  );

  // 1-based inclusive range of the rows on screen, for "51–100 of 312".
  const rangeStart = loadedCount === 0 ? 0 : pageIndex * HISTORY_PAGE_SIZE + 1;
  const rangeEnd = pageIndex * HISTORY_PAGE_SIZE + loadedCount;

  return {
    // Filter values
    channelTab,
    providerFilter,
    statusFilter,
    sortKey,
    searchText,
    setSearchText,
    activeFilterCount,

    // Filter actions
    selectChannel,
    selectProvider,
    selectStatus,
    selectSort,
    clearFilters,

    // Counts (whole window)
    channelCounts,
    providerCounts,
    providerRoster,

    // Pagination
    pageIndex,
    pageCount,
    totalMatchingCount,
    isPageLoading,
    rangeStart,
    rangeEnd,
    goToPrevPage,
    goToNextPage,
  };
}
