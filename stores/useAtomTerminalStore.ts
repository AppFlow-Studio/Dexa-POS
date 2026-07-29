// ============================================================
// ATOM internal-terminal store
// File: stores/useAtomTerminalStore.ts
// ============================================================
// Holds the on-device ("internal") ATOM terminal discovered on loopback by
// atomLoopbackDetector. This is kept SEPARATE from selectedStation.payment_terminal
// (which is a configured/DB terminal) so a station refresh can't clobber it and
// so it never overrides a real configured terminal — CardPaymentView uses it only
// as a fallback when no terminal is configured. Not persisted (re-detected on boot).
// ============================================================

import { create } from "zustand";
import type { StationPaymentTerminal } from "@/types/station";

/** Sentinel id for the in-memory internal ATOM terminal (NOT a payment_terminals UUID). */
export const ATOM_INTERNAL_TERMINAL_ID = "atom-internal";

interface AtomTerminalState {
  /** The discovered internal ATOM terminal, or null when not reachable. */
  internalTerminal: StationPaymentTerminal | null;
  /** Discovered loopback port (e.g. 8443), or null. */
  port: number | null;
  /** Last time a probe confirmed reachability (ms epoch), or null. */
  lastSeenAt: number | null;
  setInternalTerminal: (
    terminal: StationPaymentTerminal | null,
    port: number | null,
  ) => void;
  clear: () => void;
}

/** Build the synthetic internal ATOM terminal object surfaced to the UI/payment flow. */
export function buildInternalAtomTerminal(
  port: number,
): StationPaymentTerminal {
  return {
    id: ATOM_INTERNAL_TERMINAL_ID,
    terminal_name: "ATOM (on-device)",
    register_id: null,
    auth_key: null,
    terminal_type: "atom",
    terminal_model: "Landi P30",
    is_connected: true,
    ip_address: "127.0.0.1",
    port,
    connection_type: "local",
    last_connection_status: "Online",
    last_connection_test_at: null,
  };
}

export const useAtomTerminalStore = create<AtomTerminalState>((set) => ({
  internalTerminal: null,
  port: null,
  lastSeenAt: null,
  setInternalTerminal: (terminal, port) =>
    set(() => ({
      internalTerminal: terminal,
      port,
      lastSeenAt: terminal ? Date.now() : null,
    })),
  clear: () => set({ internalTerminal: null, port: null, lastSeenAt: null }),
}));
