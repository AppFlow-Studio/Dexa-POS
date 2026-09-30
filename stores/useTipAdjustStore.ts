// stores/useTipAdjustStore.ts
//
// Holds the post-capture tip-adjust state at app scope so it survives
// CardPaymentView unmounting (e.g. the bill bottom sheet collapsing
// between the initial Castles/Dejavoo sale and the customer picking a
// tip on the CFD).
//
// Why this is a store, not a CardPaymentView ref:
//   The CFD WebView posts the tip selection asynchronously back to the
//   host. By the time the host receives it, the bill detail sheet may
//   have already closed — taking CardPaymentView's local state with it.
//   The previous design hung the captured payment off CardPaymentView
//   only, so the tip-adjust trigger was lost the moment that component
//   unmounted. CFDProvider (always mounted) reads from this store
//   instead.
//
// Lifecycle:
//   1. CardPaymentView calls setCaptured() right after a successful
//      Castles or Dejavoo sale.
//   2. The customer picks a tip on the CFD; CFDProvider's tip-adjust
//      runner reads `captured`, marks `inFlight`, runs the adjust, then
//      calls `finishInFlight()` to release the slot and clear `captured`.
//      UI that is waiting on the tip step watches `captured` / `inFlight`.
//   3. If the customer never responds, CFDProvider clears the capture
//      at `expiresAt`. The timer lives there, not in CardPaymentView,
//      because that view unmounts the moment the sale completes.
//
// `referenceId` is unique per sale and is the capture's identity.
// clear() and finishInFlight() take it so a late timeout or a finishing
// runner for one guest can never erase the next guest's capture on a
// split check.

import { create } from "zustand";

export interface CapturedPayment {
  referenceId: string;
  rrn?: string;
  stan?: string;
  /** Valor reversal reference (charge-slip "Trans" number) — used for tip-adjust/void. */
  tranNo?: string;
  /** ATOM paymentId — reversal/tip-adjust reference for the on-device terminal. */
  paymentId?: string;
  dbPaymentId?: string;
  last4?: string;
  amount: number;
  /** Tip charged with the original sale (usually 0 for post-capture flow). */
  tipAmount: number;
  terminalType: "castles" | "dejavoo" | "valor" | "atom";
  /** Local order id (`useOrderStore.activeOrderId`) at capture time. */
  localOrderId?: string;
  /** db_order_id snapshotted at capture (server-authoritative when present). */
  dbOrderId?: string;
  /** Date.now() at capture — diagnostic only. */
  capturedAt: number;
  /** Date.now() after which the customer's chance to tip has passed. */
  expiresAt: number;
}

interface TipAdjustState {
  captured: CapturedPayment | null;
  inFlight: boolean;

  setCaptured: (payment: CapturedPayment | null) => void;
  startInFlight: () => boolean;
  /**
   * Release the in-flight slot. Drops the capture only if it is still the
   * sale identified by `referenceId` (any capture when omitted).
   */
  finishInFlight: (referenceId?: string) => void;
  /**
   * Drop the capture if it is the sale identified by `referenceId` (any
   * capture when omitted). Never releases the in-flight slot — only the
   * runner that took it does, through finishInFlight.
   */
  clear: (referenceId?: string) => void;
}

export const useTipAdjustStore = create<TipAdjustState>()((set, get) => ({
  captured: null,
  inFlight: false,

  setCaptured: (payment) => set({ captured: payment }),

  // Atomic check-and-set so concurrent callers can't both think they own
  // the in-flight slot. Returns true if this caller now owns it.
  startInFlight: () => {
    if (get().inFlight) return false;
    set({ inFlight: true });
    return true;
  },

  finishInFlight: (referenceId) => {
    const ownsCapture =
      !referenceId || get().captured?.referenceId === referenceId;
    set({
      inFlight: false,
      ...(ownsCapture ? { captured: null } : {}),
    });
  },

  clear: (referenceId) => {
    if (referenceId && get().captured?.referenceId !== referenceId) return;
    set({ captured: null });
  },
}));
