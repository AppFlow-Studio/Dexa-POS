import { create } from "zustand";

type OverrideAction =
  | { type: "select_menu"; payload: { menuName: string } }
  | { type: "select_category"; payload: { categoryName: string } }
  | null;

interface PinOverrideState {
  isPinModalOpen: boolean;
  actionToPerform: OverrideAction;
  requestPinOverride: (action: OverrideAction) => void;
  resolvePinRequest: () => void;
  closePinModal: () => void;
}

export const usePinOverrideStore = create<PinOverrideState>((set, get) => ({
  isPinModalOpen: false,
  actionToPerform: null,
  requestPinOverride: (action) => {
    set({ isPinModalOpen: true, actionToPerform: action });
  },
  resolvePinRequest: () => {
    const { actionToPerform } = get();
    if (actionToPerform) {
      // Logic to execute the action will be handled in the UI component
      // after successful PIN entry.
    }
    set({ isPinModalOpen: false, actionToPerform: null });
  },
  closePinModal: () => {
    set({ isPinModalOpen: false, actionToPerform: null });
  },
}));
