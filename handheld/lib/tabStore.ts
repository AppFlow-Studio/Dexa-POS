import { create } from "zustand";
import type { HandheldTab } from "../types";

interface TabState {
  tab: HandheldTab;
  setTab: (tab: HandheldTab) => void;
}

/**
 * The active root tab, outside HandheldRoot so a pushed page can land the
 * user on a tab when it pops ("Dine in" on New order → Tables).
 */
export const useHandheldTab = create<TabState>((set) => ({
  tab: "tables",
  setTab: (tab) => set({ tab }),
}));
