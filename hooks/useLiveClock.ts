import { useEffect, useState } from "react";
import { AppState } from "react-native";

interface LiveClockResult {
  time: string;
  date: string;
}

/**
 * Live clock hook that updates every second.
 * Formats time and date according to the provided timezone.
 *
 * AppState-aware: the 1s interval only runs while the app is in the foreground.
 * Left ungated it ticked 3600×/hour on a permanently-mounted header even while
 * the device sat idle/backgrounded — each tick allocating Intl-formatted strings
 * + a setState/re-render, which piles up as uncollected garbage during idle
 * (the "memory climbs while idle, drops when I touch the screen" churn). On
 * return to foreground we resync immediately so the displayed time never lags.
 */
export const useLiveClock = (timezone?: string): LiveClockResult => {
  const [clock, setClock] = useState<LiveClockResult>(() =>
    formatClock(timezone)
  );

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval !== null) return;
      setClock(formatClock(timezone)); // resync on (re)start
      interval = setInterval(() => {
        setClock(formatClock(timezone));
      }, 1000);
    };
    const stop = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    if (AppState.currentState === "active") start();

    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") start();
      else stop();
    });

    return () => {
      stop();
      sub.remove();
    };
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
