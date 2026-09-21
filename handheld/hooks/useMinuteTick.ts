import { useEffect, useState } from "react";

/**
 * A timestamp that advances once a minute. Screens pass it to their rows (and
 * to FlashList's `extraData`) so elapsed-time labels tick without every row
 * owning an interval.
 */
export function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
