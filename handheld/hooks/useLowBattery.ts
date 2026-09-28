import * as Battery from "expo-battery";
import { useCallback, useEffect, useRef, useState } from "react";
import { estimateMinutesLeft, lowStep, shouldPrompt, type BatterySample } from "../lib/battery";

export interface LowBattery {
  /** 0–100, or null when the platform cannot say. */
  percent: number | null;
  minutesLeft: number | null;
  /** The sheet should be up. */
  prompt: boolean;
  /** "Not now" or a finished transfer: stay quiet until the next step or a recharge. */
  dismiss: () => void;
}

/** Above this, the level is read every SLOW_MS; at or below it, every FAST_MS. */
const FAST_BELOW = 20;
const SLOW_MS = 5 * 60_000;
const FAST_MS = 60_000;

interface Reading {
  percent: number | null;
  charging: boolean;
}

/**
 * The battery, read on a timer. Not expo-battery's `useBatteryLevel`: on
 * Android its listener only fires on ACTION_BATTERY_LOW / OKAY (~15% / 20%),
 * so after the first read the level never reached 10% or 5% and the sheet
 * never opened. One native read every 5 minutes, every minute once the level
 * is at 20% or below unplugged; RN timers do not fire while backgrounded, so
 * a pocketed, locked device is not woken for it.
 */
function useBatteryReading(): Reading {
  const [reading, setReading] = useState<Reading>({ percent: null, charging: false });
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      let next: Reading | null = null;
      try {
        const [level, state] = await Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()]);
        next = {
          percent: level >= 0 ? Math.round(level * 100) : null,
          charging: state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL,
        };
      } catch {
        // Unreadable (emulator without a battery): try again on the slow cadence.
      }
      if (cancelled) return;
      if (next) {
        const r = next;
        setReading((prev) => (prev.percent === r.percent && prev.charging === r.charging ? prev : r));
      }
      const fast = next !== null && next.percent !== null && next.percent <= FAST_BELOW && !next.charging;
      timer = setTimeout(() => void read(), fast ? FAST_MS : SLOW_MS);
    };
    void read();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return reading;
}

/** The low-battery prompt state. Drain samples reset on charge, so the estimate is "since unplugged". */
export function useLowBattery(): LowBattery {
  const { percent, charging } = useBatteryReading();
  const samples = useRef<BatterySample[]>([]);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  const [seen, setSeen] = useState(Number.POSITIVE_INFINITY);

  useEffect(() => {
    if (charging) {
      samples.current = [];
      setMinutesLeft(null);
      setSeen(Number.POSITIVE_INFINITY);
      return;
    }
    if (percent === null) return;
    const last = samples.current[samples.current.length - 1];
    if (!last || last.percent !== percent) samples.current.push({ at: Date.now(), percent });
    setMinutesLeft(estimateMinutesLeft(samples.current));
  }, [percent, charging]);

  const dismiss = useCallback(() => {
    const step = lowStep(percent);
    if (step !== null) setSeen(step);
  }, [percent]);

  return { percent, minutesLeft, prompt: shouldPrompt(percent, charging, seen), dismiss };
}
