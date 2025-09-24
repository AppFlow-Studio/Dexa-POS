import { create } from "zustand";

interface SettingsState {
  defaultSittingTimeMinutes: number;
  setDefaultSittingTimeMinutes: (minutes: number) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  // Default to 60 minutes (1 Hour)
  defaultSittingTimeMinutes: 60,

  setDefaultSittingTimeMinutes: (minutes) => {
    set({ defaultSittingTimeMinutes: minutes });
  },
}));
