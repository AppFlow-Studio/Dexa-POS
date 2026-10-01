import { create } from "zustand";

/** One per-order PIN prompt: whose order it attributes and what to do after. */
export interface OrderPinGateRequest {
  /** Identity of the OrderPinGate that showed it; only that one can hide it. */
  owner: object;
  attributionOrderId: string | null;
  onVerified: (staffProfileId: string) => void;
  onCancel?: () => void;
}

interface OrderPinGateState {
  request: OrderPinGateRequest | null;
  /**
   * A request the host has already answered (verified or cancelled) and keeps
   * hidden while its owner catches up — see OrderPinGateHost.
   */
  answered: OrderPinGateRequest | null;
  show: (request: OrderPinGateRequest) => void;
  /** Hide `owner`'s prompt; a no-op when another owner's prompt is up. */
  hide: (owner: object) => void;
  setAnswered: (request: OrderPinGateRequest | null) => void;
}

/**
 * The per-order PIN prompt on screen, if any. Screens declare it with
 * `<OrderPinGate open />`; the single `<OrderPinGateHost />` at the app root
 * draws it. Showing and hiding is a store flip on an always-mounted view — no
 * dialog mount, no portal round-trip — so the prompt appears in the same frame
 * as the state that opens it.
 */
export const useOrderPinGateStore = create<OrderPinGateState>()((set, get) => ({
  request: null,
  answered: null,
  show: (request) => set({ request }),
  hide: (owner) => {
    if (get().request?.owner === owner) set({ request: null });
  },
  setAnswered: (answered) => set({ answered }),
}));
