import { create } from "zustand";

type OverrideAction =
  | { type: "select_menu"; payload: { menuName: string } }
  | { type: "select_category"; payload: { categoryName: string } }
  | {
      type: "edit_service_charge";
      payload: {
        orderId: string;
        /** Resolved flat dollar amount (always set, used for the context label). */
        newAmount: number;
        /** 'amount' (default) or 'percent' — forwarded to override_service_charge_v3. */
        mode: 'amount' | 'percent';
        /** Percentage value 0-100 when mode='percent'; null when mode='amount'. */
        rate: number | null;
        /** Whether the overridden SC should be taxed. */
        isTaxable: boolean;
        reason?: string;
      };
    }
  | {
      type: "remove_service_charge";
      payload: { orderId: string; reason?: string };
    }
  | null;

interface PinOverrideState {
  isPinModalOpen: boolean;
  actionToPerform: OverrideAction;
  /** Epoch ms when the current manager unlock session expires. null = locked. */
  unlockedUntil: number | null;

  requestPinOverride: (action: OverrideAction) => void;
  closePinModal: () => void;
  /** Returns true if a manager unlock session is still active. */
  isUnlocked: () => boolean;
  /** Called on successful PIN entry. Pass 0 to grant one-time access only. */
  setUnlocked: (timeoutMinutes: number) => void;
  /** Manually lock (e.g. staff presses the lock badge). */
  lockNow: () => void;
  /** @deprecated kept for call sites — just calls closePinModal */
  resolvePinRequest: () => void;
}

export const usePinOverrideStore = create<PinOverrideState>((set, get) => ({
  isPinModalOpen: false,
  actionToPerform: null,
  unlockedUntil: null,

  requestPinOverride: (action) => {
    set({ isPinModalOpen: true, actionToPerform: action });
  },

  closePinModal: () => {
    set({ isPinModalOpen: false, actionToPerform: null });
  },

  isUnlocked: () => {
    const { unlockedUntil } = get();
    return unlockedUntil !== null && Date.now() < unlockedUntil;
  },

  setUnlocked: (timeoutMinutes) => {
    if (timeoutMinutes <= 0) {
      // One-time grant only — don't start a session
      set({ unlockedUntil: null });
      return;
    }
    set({ unlockedUntil: Date.now() + timeoutMinutes * 60_000 });
  },

  lockNow: () => {
    set({ unlockedUntil: null });
  },

  resolvePinRequest: () => {
    set({ isPinModalOpen: false, actionToPerform: null });
  },
}));
