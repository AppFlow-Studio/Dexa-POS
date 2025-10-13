import { create } from "zustand";

interface EmployeeSettingsState {
  isBreakAndSwitchEnabled: boolean;
  setIsBreakAndSwitchEnabled: (isEnabled: boolean) => void;
}

export const useEmployeeSettingsStore = create<EmployeeSettingsState>(
  (set) => ({
    isBreakAndSwitchEnabled: true, // Enabled by default
    setIsBreakAndSwitchEnabled: (isEnabled) =>
      set({ isBreakAndSwitchEnabled: isEnabled }),
  })
);
