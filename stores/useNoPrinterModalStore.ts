import { create } from "zustand";

type PrinterType = "receipt" | "kitchen";

interface NoPrinterModalState {
  visible: boolean;
  printerType: PrinterType;
  show: (type: PrinterType) => void;
  hide: () => void;
}

export const useNoPrinterModalStore = create<NoPrinterModalState>((set) => ({
  visible: false,
  printerType: "receipt",
  show: (type) => set({ visible: true, printerType: type }),
  hide: () => set({ visible: false }),
}));
