import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import React from "react";
import { create } from "zustand";

interface NotificationSheetState {
  sheetRef: React.RefObject<BottomSheetMethods> | null;
  setSheetRef: (ref: React.RefObject<BottomSheetMethods>) => void;
  openSheet: () => void;
  closeSheet: () => void;
}

export const useNotificationSheetStore = create<NotificationSheetState>(
  (set, get) => ({
    sheetRef: null,
    setSheetRef: (ref) => set({ sheetRef: ref }),
    openSheet: () => {
      get().sheetRef?.current?.expand();
    },
    closeSheet: () => {
      get().sheetRef?.current?.close();
    },
  })
);
