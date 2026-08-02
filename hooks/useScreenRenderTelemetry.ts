/**
 * Per-screen mount and re-render cost.
 *
 * Splits a screen's cost into the two things that need different fixes:
 * `screen.mount_ms.<name>` (first render call → first committed frame — the
 * cold cost of entering the screen) and `screen.render_ms.<name>` (the same
 * measurement for every later commit — the cost of staying on it while orders
 * mutate). `screen.renders.<name>` is the raw commit count, which is what
 * tells you whether a screen is re-rendering far more often than it should.
 *
 * Call it first in the screen component so the render-start timestamp is taken
 * before the rest of the hook graph runs:
 *
 *   export default function TablesScreen() {
 *     useScreenRenderTelemetry("tables");
 *     ...
 *   }
 */

import { screenKeyIds } from "@/lib/telemetry/keys";
import { recordCount, recordSpan } from "@/lib/telemetry/registry";
import { useEffect, useRef } from "react";

export function useScreenRenderTelemetry(name: string): void {
  const ids = screenKeyIds(name);

  // Taken during render, read in the effect below — the gap between the two is
  // this commit's render + layout work on the JS thread.
  const renderStartRef = useRef(0);
  renderStartRef.current = Date.now();

  const mountedRef = useRef(false);

  recordCount(ids.renders);

  useEffect(() => {
    const elapsed = Date.now() - renderStartRef.current;
    if (mountedRef.current) {
      recordSpan(ids.renderMs, elapsed);
    } else {
      mountedRef.current = true;
      recordSpan(ids.mountMs, elapsed);
    }
  });
}
