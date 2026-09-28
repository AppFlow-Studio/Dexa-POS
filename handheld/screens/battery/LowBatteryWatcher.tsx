import React from "react";
import { useLowBattery, type LowBattery } from "../../hooks/useLowBattery";
import { LowBatterySheet } from "./LowBatterySheet";
import { useMyOpenTables } from "./useMyOpenTables";

/**
 * Subscribes to the table sessions only while the prompt is due, so a
 * charged device pays nothing for this. No open tables, no sheet: there is
 * nothing to hand off, and it would only interrupt.
 */
function LowBatteryPrompt({ battery }: { battery: LowBattery }) {
  const tables = useMyOpenTables();
  if (tables.length === 0 || battery.percent === null) return null;
  return (
    <LowBatterySheet
      percent={battery.percent}
      minutesLeft={battery.minutesLeft}
      tables={tables}
      onDone={battery.dismiss}
    />
  );
}

/** Mounted once in HandheldFrame, so the sheet can open over any handheld page. */
export function LowBatteryWatcher() {
  const battery = useLowBattery();
  return battery.prompt ? <LowBatteryPrompt battery={battery} /> : null;
}
