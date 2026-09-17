// ============================================================
// Payment processor preference
// File: stores/useProcessorPreferenceStore.ts
// ============================================================
// Persisted, per-device toggle for whether the on-device ATOM is the active
// processor for NEW sales. Read by useActiveProcessor.
//
//   atomEnabled = true  (ATOM) — new card sales use the on-device ATOM when it's
//                                surfaced (falls back to the configured terminal
//                                if ATOM is down).
//   atomEnabled = false (Off)  — new card sales use the configured terminal only;
//                                ATOM is not used for new sales.
//
// This does NOT affect refund/tip-adjust of EXISTING payments — those always
// follow the terminal each payment was captured on, so ATOM payments can still
// be reversed even when ATOM is "Off" for new sales.
// ============================================================

import { createLazyPersistStorage } from "@/lib/storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ProcessorPreferenceState {
  /** True = ATOM active for new sales; false = Off (use configured terminal). */
  atomEnabled: boolean;
  setAtomEnabled: (enabled: boolean) => void;
  /**
   * True = auto-detected on-device CodePay is usable for new sales (as a
   * fallback when no terminal is configured); false = don't surface it. Same
   * reversal-independence as atomEnabled: existing CodePay payments can always
   * be refunded/tip-adjusted regardless of this flag.
   */
  codepayEnabled: boolean;
  setCodepayEnabled: (enabled: boolean) => void;
}

export const useProcessorPreferenceStore = create<ProcessorPreferenceState>()(
  persist(
    (set) => ({
      atomEnabled: true,
      setAtomEnabled: (atomEnabled) => set({ atomEnabled }),
      codepayEnabled: true,
      setCodepayEnabled: (codepayEnabled) => set({ codepayEnabled }),
    }),
    {
      name: "dexa-pos-processor-preference",
      storage: createLazyPersistStorage(),
    },
  ),
);
