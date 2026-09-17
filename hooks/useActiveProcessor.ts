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
import { useCodePayTerminalStore } from "@/stores/useCodePayTerminalStore";
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
  source: "atom" | "codepay" | "configured" | "none";
  /** All terminal types this station can process reversals on (atom/codepay + configured). */
  availableTypes: string[];
  /** True when the on-device ATOM is surfaced. */
  atomActive: boolean;
  /** True when the on-device CodePay Register is detected + surfaced. */
  codepayActive: boolean;
  /** The configured (DB) terminal's type, if any. */
  configuredType: string | null;
  /** Whether ATOM is enabled for NEW sales. */
  atomEnabled: boolean;
  /** Whether auto-detected CodePay is enabled for NEW sales. */
  codepayEnabled: boolean;
}

function computeActiveProcessor(
  atomInternal: StationPaymentTerminal | null,
  configured: StationPaymentTerminal | null,
  atomEnabled: boolean,
  codepayInternal: StationPaymentTerminal | null,
  codepayEnabled: boolean,
): ActiveProcessor {
  // ATOM on → prefer the on-device ATOM for new sales; then a configured DB
  // terminal; then auto-detected CodePay as a fallback. CodePay is a fallback
  // (NOT preferred over a configured terminal) so that a real provisioned
  // CodePay row — which carries a DB id sales stamp + settlement need — always
  // wins over the synthetic internal terminal.
  const codepayFallback = codepayEnabled ? codepayInternal : null;
  const activeTerminal: StationPaymentTerminal | null = atomEnabled
    ? (atomInternal ?? configured ?? codepayFallback ?? null)
    : (configured ?? codepayFallback ?? null);

  const activeType = activeTerminal?.terminal_type ?? null;
  const source: ActiveProcessor["source"] =
    activeTerminal == null
      ? "none"
      : activeTerminal === atomInternal
        ? "atom"
        : activeTerminal === codepayInternal
          ? "codepay"
          : "configured";

  const availableTypes = Array.from(
    new Set(
      [
        atomInternal ? "atom" : null,
        codepayInternal ? "codepay" : null,
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
    codepayActive: !!codepayInternal,
    configuredType: configured?.terminal_type ?? null,
    atomEnabled,
    codepayEnabled,
  };
}

/** Reactive selector for render / gates. */
export function useActiveProcessor(): ActiveProcessor {
  const atomInternal = useAtomTerminalStore((s) => s.internalTerminal);
  const codepayInternal = useCodePayTerminalStore((s) => s.internalTerminal);
  const configured = useStoreSettingsStore(
    (s) => s.selectedStation?.payment_terminal ?? null,
  );
  const atomEnabled = useProcessorPreferenceStore((s) => s.atomEnabled);
  const codepayEnabled = useProcessorPreferenceStore((s) => s.codepayEnabled);
  return useMemo(
    () =>
      computeActiveProcessor(
        atomInternal,
        configured,
        atomEnabled,
        codepayInternal,
        codepayEnabled,
      ),
    [atomInternal, configured, atomEnabled, codepayInternal, codepayEnabled],
  );
}

/**
 * Non-hook variant for use inside effects / services (reads current store state).
 * Same result as the hook, without subscribing.
 */
export function resolveActiveProcessor(): ActiveProcessor {
  const atomInternal = useAtomTerminalStore.getState().internalTerminal;
  const codepayInternal = useCodePayTerminalStore.getState().internalTerminal;
  const configured =
    useStoreSettingsStore.getState().selectedStation?.payment_terminal ?? null;
  const atomEnabled = useProcessorPreferenceStore.getState().atomEnabled;
  const codepayEnabled =
    useProcessorPreferenceStore.getState().codepayEnabled;
  return computeActiveProcessor(
    atomInternal,
    configured,
    atomEnabled,
    codepayInternal,
    codepayEnabled,
  );
}
