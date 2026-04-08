import { create } from "zustand";

interface WaitlistSheetState {
  isOpen: boolean;
  initialMode: "list" | "add";
  openSheet: (mode?: "list" | "add") => void;
  closeSheet: () => void;
}

export const useWaitlistSheetStore = create<WaitlistSheetState>((set) => ({
  isOpen: false,
  initialMode: "list",
  openSheet: (mode = "list") => set({ isOpen: true, initialMode: mode }),
  closeSheet: () => set({ isOpen: false, initialMode: "list" }),
}));
