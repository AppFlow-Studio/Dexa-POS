/**
 * The customer directory, for any screen that needs to find a person.
 *
 * Four screens read the directory — the bill's CustomerSheet, the waitlist
 * form, the reservations panel, the host station's add-to-waitlist form — and
 * before Phase 5 each of them did the same three things: read the 200-row MMKV
 * cache synchronously, hold it in state, and filter it in JS. This hook
 * replaces the first two of those, and deliberately NOT the third.
 *
 * WHY THE PER-SCREEN FILTER STAYS PUT. Each screen matches on slightly
 * different fields with slightly different rules — the sheet includes address,
 * the waitlist normalizes phones to digits and requires 3 of them, the
 * reservations panel matches raw phone text. Pulling those into SQL would mean
 * four SQL predicates kept in step with four JS ones by hand. Instead
 * `searchLocalCustomers` returns a SUPERSET of the candidates, and each
 * screen's existing filter runs over that unchanged. What changes is only the
 * size of the pool being filtered: the whole directory instead of the most
 * recent 200.
 *
 * DEBOUNCED, because the query changes on every keystroke and each change is a
 * SQL scan of up to 5,000 rows. The delay is short enough to feel immediate and
 * long enough that a fast typist pays for one query rather than eight.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { loadCustomerDirectory } from "@/services/customer";
import type { CustomerWithMeta } from "@/types/customer";

/**
 * Keystroke coalescing window. Deliberately below the ~250 ms at which typing
 * starts to feel laggy, and above a fast typist's inter-key interval.
 */
export const CUSTOMER_SEARCH_DEBOUNCE_MS = 180;

export interface CustomerDirectory {
  /** Candidates for the current query. Filter further as the screen needs. */
  customers: CustomerWithMeta[];
  /** True while the first load for this screen is still in flight. */
  isLoading: boolean;
  /** Re-read the directory — after creating or editing a customer. */
  reload: () => void;
}

export function useCustomerDirectory(
  query = "",
  opts: { enabled?: boolean } = {},
): CustomerDirectory {
  const enabled = opts.enabled !== false;
  const [customers, setCustomers] = useState<CustomerWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Guards an out-of-order resolve: with a debounce plus an async read, a
  // slow query for "an" can land after a fast one for "anna" and repopulate
  // the list with the wrong candidates. Only the newest request may write.
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const requestId = ++requestRef.current;
    let cancelled = false;
    setIsLoading(true);

    const timer = setTimeout(() => {
      void loadCustomerDirectory(query)
        .then((rows) => {
          if (cancelled || requestId !== requestRef.current) return;
          setCustomers(rows);
        })
        .catch(() => {
          // loadCustomerDirectory already falls back to the MMKV cache; a
          // throw here means both paths failed, and an empty list is the only
          // honest answer. Never surfaced as an error: the screens all have a
          // "no results" state already.
          if (cancelled || requestId !== requestRef.current) return;
          setCustomers([]);
        })
        .finally(() => {
          if (cancelled || requestId !== requestRef.current) return;
          setIsLoading(false);
        });
    }, CUSTOMER_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, enabled, reloadToken]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  return { customers, isLoading, reload };
}
