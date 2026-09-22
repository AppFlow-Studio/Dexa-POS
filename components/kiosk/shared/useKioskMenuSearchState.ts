import { useCallback, useState } from "react";
import { Keyboard } from "react-native";

export interface KioskMenuSearchState {
  /** Is the field open (and the results layer up)? */
  expanded: boolean;
  query: string;
  setQuery: (value: string) => void;
  open: () => void;
  /** Close, drop the query, put the keyboard away. */
  close: () => void;
  /** Empty the query but stay open — a correction mid-search, not an exit. */
  clear: () => void;
}

/**
 * Open/closed and the query for the menu screen's inline search.
 *
 * Held by the menu view rather than inside the search components because two
 * siblings need it — the control row draws the field, the results layer reads
 * the query — and because it must stay out of the browsing state: the selected
 * category and both scroll positions live on, untouched, while a search runs
 * over the top of them.
 *
 * `onActivity` is the idle timer. The kiosk otherwise counts only touches, and
 * a customer typing on the software keyboard produces none — long enough to
 * hunt for an item and the "Are you still there?" warning would fire on
 * someone actively using the screen.
 */
export function useKioskMenuSearchState(
  onActivity?: () => void,
): KioskMenuSearchState {
  const [expanded, setExpanded] = useState(false);
  const [query, setQueryValue] = useState("");

  const setQuery = useCallback(
    (value: string) => {
      setQueryValue(value);
      onActivity?.();
    },
    [onActivity],
  );

  const open = useCallback(() => {
    setExpanded(true);
    onActivity?.();
  }, [onActivity]);

  const close = useCallback(() => {
    Keyboard.dismiss();
    setExpanded(false);
    setQueryValue("");
    onActivity?.();
  }, [onActivity]);

  const clear = useCallback(() => {
    setQueryValue("");
    onActivity?.();
  }, [onActivity]);

  return { expanded, query, setQuery, open, close, clear };
}
