import { useEffect, useState } from "react";

interface LiveClockResult {
  time: string;
  date: string;
}

/**
 * Live clock hook that updates every second.
 * Formats time and date according to the provided timezone.
 */
export const useLiveClock = (timezone?: string): LiveClockResult => {
  const [clock, setClock] = useState<LiveClockResult>(() =>
    formatClock(timezone)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setClock(formatClock(timezone));
    }, 1000);

    return () => clearInterval(interval);
  }, [timezone]);

  return clock;
};

function formatClock(timezone?: string): LiveClockResult {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = timezone
    ? { timeZone: timezone }
    : {};

  const time = now.toLocaleTimeString("en-US", {
    ...options,
    hour: "numeric",
    minute: "2-digit",
    // second: "2-digit",
    hour12: true,
  });

  const date = now.toLocaleDateString("en-US", {
    ...options,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return { time, date };
}
