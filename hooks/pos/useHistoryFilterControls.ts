import {
    buildProviderRosterFromSummaries,
    countChannelsFromSummaries,
    countProvidersFromSummaries,
    type ChannelTab,
    type ProviderKey,
    type SortKey,
    type StatusFilter,
} from "@/lib/previousOrdersFilters";
import { PROVIDER_ORDER } from "@/services/historyOrderTaxonomy";
import {
    HISTORY_PAGE_SIZE,
    usePreviousOrdersStore,
} from "@/stores/usePreviousOrdersStore";
import { useCallback, useEffect, useMemo, useState } from "react";

/** Idle time after the last keystroke before a search hits the server. */
const SEARCH_DEBOUNCE_MS = 350;

/** Stable identities, so an unloaded window doesn't churn memo dependents. */
const EMPTY_CHANNEL_COUNTS: Record<ChannelTab, number> = {
  all: 0,
  online: 0,
  dine_in: 0,
  takeout: 0,
  delivery: 0,
};
const EMPTY_PROVIDER_COUNTS: Record<string, number> = {};

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
  //
  // `countsReady` is false until the summaries land. The controls render a
  // placeholder rather than 0 in that gap: a hard 0 next to a list full of
  // orders reads as a broken screen, and this list is often painted from cache
  // before the counts arrive.
  const countsReady = windowSummaries != null;

  // Memoized on the summaries themselves — the window can hold thousands of
  // rows and every unrelated re-render was re-bucketing all of them.
  const { channelCounts, providerCounts, summaryRoster } = useMemo(() => {
    if (!windowSummaries) {
      return {
        channelCounts: EMPTY_CHANNEL_COUNTS,
        providerCounts: EMPTY_PROVIDER_COUNTS,
        summaryRoster: [] as ProviderKey[],
      };
    }
    return {
      channelCounts: countChannelsFromSummaries(windowSummaries, "all"),
      providerCounts: countProvidersFromSummaries(windowSummaries, "all"),
      summaryRoster: buildProviderRosterFromSummaries(windowSummaries),
    };
  }, [windowSummaries]);

  // The selected provider always keeps its chip, even once the window holds
  // none of its orders — otherwise the active filter's own control disappears
  // and the merchant is left on an empty list with no visible way back.
  const providerRoster = useMemo(() => {
    if (providerFilter === "all" || summaryRoster.includes(providerFilter)) {
      return summaryRoster;
    }
    return PROVIDER_ORDER.filter(
      (key) => key === providerFilter || summaryRoster.includes(key),
    );
  }, [summaryRoster, providerFilter]);

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
    countsReady,

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
