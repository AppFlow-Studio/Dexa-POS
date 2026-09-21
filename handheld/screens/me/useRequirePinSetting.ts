import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useCallback, useState } from "react";

/**
 * "Require PIN per order" on the Me tab. The switch does not flip on tap:
 * it asks for a manager PIN first (the handheld has no Settings route, so
 * this is the only place the value can change on the device), and the
 * approval writes `requirePinPerOrder` — the same device-local field the
 * register's Settings › Order Line toggle writes.
 */
export function useRequirePinSetting() {
  const on = useStoreSettingsStore((s) => s.requirePinPerOrder);
  const updateField = useStoreSettingsStore((s) => s.updateField);
  /** The value awaiting manager approval, or null when no PIN screen is up. */
  const [pending, setPending] = useState<boolean | null>(null);

  const request = useCallback((next: boolean) => setPending(next), []);
  const cancel = useCallback(() => setPending(null), []);
  const approve = useCallback(() => {
    if (pending !== null) updateField("requirePinPerOrder", pending);
    setPending(null);
  }, [pending, updateField]);

  const approvalLabel = pending ? "Turn on Require PIN per order" : "Turn off Require PIN per order";

  return { on, pending, approvalLabel, request, approve, cancel };
}
