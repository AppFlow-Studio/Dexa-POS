// ============================================================
// useActiveProcessor — single source of truth for terminal routing
// File: hooks/useActiveProcessor.ts
// ============================================================
// One place that answers "which payment terminal is active on this station?".
// Every gate (Charge Card, Adjust Tip, Process Refund) and the payment/tip/
// refund routing reads from here so they can never disagree.
//
//   activeTerminal  — the terminal a NEW sale should use (honours the user's
//                     processor preference: auto / force ATOM / prefer configured).
//   availableTypes  — every terminal type this station can service refund/tip-
//                     adjust on (on-device ATOM + configured). Feed to
//                     getTerminalMatchInfo — an EXISTING payment can be reversed
//                     on any available terminal that matches its capture type.
// ============================================================

import { useMemo } from "react";
import type { StationPaymentTerminal } from "@/types/station";
import { useAtomTerminalStore } from "@/stores/useAtomTerminalStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useProcessorPreferenceStore } from "@/stores/useProcessorPreferenceStore";
import { describeProcessor } from "@/lib/processorLabels";

export interface ActiveProcessor {
  /** Terminal a NEW sale should use (may be null if none available). */
  activeTerminal: StationPaymentTerminal | null;
  /** terminal_type of activeTerminal. */
  activeType: string | null;
  /** Human label, e.g. "ATOM (on-device) · TSYS". */
  activeLabel: string;
  /** Where the active terminal came from. */
  source: "atom" | "configured" | "none";
  /** All terminal types this station can process reversals on (atom + configured). */
  availableTypes: string[];
  /** True when the on-device ATOM is surfaced. */
  atomActive: boolean;
  /** The configured (DB) terminal's type, if any. */
  configuredType: string | null;
  /** Whether ATOM is enabled for NEW sales. */
  atomEnabled: boolean;
}

function computeActiveProcessor(
  atomInternal: StationPaymentTerminal | null,
  configured: StationPaymentTerminal | null,
  atomEnabled: boolean,
): ActiveProcessor {
  // ATOM on → prefer the on-device ATOM for new sales; Off → configured only.
  const activeTerminal: StationPaymentTerminal | null = atomEnabled
    ? (atomInternal ?? configured ?? null)
    : (configured ?? null);

  const activeType = activeTerminal?.terminal_type ?? null;
  const source: ActiveProcessor["source"] =
    activeTerminal == null
      ? "none"
      : activeTerminal.terminal_type === "atom"
        ? "atom"
        : "configured";

  const availableTypes = Array.from(
    new Set(
      [
        atomInternal ? "atom" : null,
        configured?.terminal_type ?? null,
      ].filter((t): t is string => !!t),
    ),
  );

  return {
    activeTerminal,
    activeType,
    activeLabel: describeProcessor(activeType),
    source,
    availableTypes,
    atomActive: !!atomInternal,
    configuredType: configured?.terminal_type ?? null,
    atomEnabled,
  };
}

/** Reactive selector for render / gates. */
export function useActiveProcessor(): ActiveProcessor {
  const atomInternal = useAtomTerminalStore((s) => s.internalTerminal);
  const configured = useStoreSettingsStore(
    (s) => s.selectedStation?.payment_terminal ?? null,
  );
  const atomEnabled = useProcessorPreferenceStore((s) => s.atomEnabled);
  return useMemo(
    () => computeActiveProcessor(atomInternal, configured, atomEnabled),
    [atomInternal, configured, atomEnabled],
  );
}

/**
 * Non-hook variant for use inside effects / services (reads current store state).
 * Same result as the hook, without subscribing.
 */
export function resolveActiveProcessor(): ActiveProcessor {
  const atomInternal = useAtomTerminalStore.getState().internalTerminal;
  const configured =
    useStoreSettingsStore.getState().selectedStation?.payment_terminal ?? null;
  const atomEnabled = useProcessorPreferenceStore.getState().atomEnabled;
  return computeActiveProcessor(atomInternal, configured, atomEnabled);
}
