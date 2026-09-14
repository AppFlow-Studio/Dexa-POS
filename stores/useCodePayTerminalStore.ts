// ============================================================
// CodePay internal-terminal store
// File: stores/useCodePayTerminalStore.ts
// ============================================================
// Holds the on-device ("internal") CodePay terminal detected by codepayDetector
// (presence of the CodePay Register app + a configured app_id), plus the
// persisted merchant `appId` that the Intent needs.
//
// Mirrors useAtomTerminalStore, with ONE addition: unlike ATOM (which needs no
// credentials to route), CodePay's Intent requires the merchant `app_id`. That
// value is the single thing the POS must hold; it is persisted so auto-detect
// activates CodePay with no further config. The synthetic terminal itself is NOT
// persisted (re-detected on boot).
// ============================================================

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createLazyPersistStorage } from "@/lib/storage";
import type { StationPaymentTerminal } from "@/types/station";
import {
  CODEPAY_DEFAULT_APP_ID,
  CODEPAY_INTERNAL_TERMINAL_ID,
} from "@/types/codepay";

interface CodePayTerminalState {
  /** The detected internal CodePay terminal, or null when the Register app isn't present. */
  internalTerminal: StationPaymentTerminal | null;
  /** Merchant CodePay app_id (Intent extra). Persisted. Empty = not configured. */
  appId: string;
  /** Last time a presence check confirmed the Register app (ms epoch), or null. */
  lastSeenAt: number | null;
  setInternalTerminal: (terminal: StationPaymentTerminal | null) => void;
  setAppId: (appId: string) => void;
  clear: () => void;
}

/** Build the synthetic internal CodePay terminal surfaced to the UI/payment flow. */
export function buildInternalCodePayTerminal(
  appId: string,
): StationPaymentTerminal {
  return {
    id: CODEPAY_INTERNAL_TERMINAL_ID,
    terminal_name: "CodePay (on-terminal)",
    // The Intent app_id — charge/refund/tip paths read `app_id ?? register_id`.
    register_id: appId,
    app_id: appId,
    auth_key: null,
    terminal_type: "codepay",
    terminal_model: null,
    is_connected: true,
    connection_type: "local",
    last_connection_status: "Online",
    last_connection_test_at: null,
  };
}

export const useCodePayTerminalStore = create<CodePayTerminalState>()(
  persist(
    (set) => ({
      internalTerminal: null,
      appId: CODEPAY_DEFAULT_APP_ID,
      lastSeenAt: null,
      setInternalTerminal: (terminal) =>
        set(() => ({
          internalTerminal: terminal,
          lastSeenAt: terminal ? Date.now() : null,
        })),
      setAppId: (appId) => set({ appId }),
      clear: () => set({ internalTerminal: null, lastSeenAt: null }),
    }),
    {
      name: "dexa-pos-codepay-terminal",
      storage: createLazyPersistStorage(),
      // Persist ONLY the app_id — the synthetic terminal is re-detected on boot.
      partialize: (s) => ({ appId: s.appId }),
    },
  ),
);
