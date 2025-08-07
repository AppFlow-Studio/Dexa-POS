import React from "react";
import { create } from "zustand";

interface SidePanelState {
  content: React.ReactNode | null;
  isOpen: boolean;
  setContent: (content: React.ReactNode) => void;
  open: () => void;
  close: () => void;
}

export const useSidePanelStore = create<SidePanelState>((set) => ({
  content: null,
  isOpen: false,
  setContent: (content) => set({ content, isOpen: true }),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
