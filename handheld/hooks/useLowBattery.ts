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

/**
 * The battery, from expo-battery's hooks — on Android they follow
 * ACTION_BATTERY_CHANGED, which fires on every 1% change, so nothing polls.
 * Drain samples reset whenever the device is plugged in, so the estimate is
 * always "since unplugged".
 */
export function useLowBattery(): LowBattery {
  const level = Battery.useBatteryLevel();
  const state = Battery.useBatteryState();
  const percent = level >= 0 ? Math.round(level * 100) : null;
  const charging = state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;

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
