import { BottomSheetMethods } from "@/components/ui/bottomSheet";
import React from "react";
import { create } from "zustand";

interface NotificationSheetState {
  sheetRef: React.RefObject<BottomSheetMethods> | null;
  setSheetRef: (ref: React.RefObject<BottomSheetMethods>) => void;
  clearSheetRef: (ref: React.RefObject<BottomSheetMethods>) => void;
  openSheet: () => void;
  closeSheet: () => void;
}

export const useNotificationSheetStore = create<NotificationSheetState>(
  (set, get) => ({
    sheetRef: null,
    setSheetRef: (ref) => set({ sheetRef: ref }),
    // Only clear if the stored ref is still the one this owner registered, so a
    // stale owner unmounting after a newer owner mounted doesn't wipe the live ref.
    clearSheetRef: (ref) => {
      if (get().sheetRef === ref) set({ sheetRef: null });
    },
    openSheet: () => {
      get().sheetRef?.current?.expand();
    },
    closeSheet: () => {
      get().sheetRef?.current?.close();
    },
  })
);
