import { create } from "zustand";

export const ALL_FLOORS = "all";

interface TablesFilterState {
  /** A floor plan id, or ALL_FLOORS. Shared by the Tables tab and the table picker. */
  floorId: string;
  setFloorId: (floorId: string) => void;
}

/** Survives the Tables tab unmounting (inactive tabs unmount) and the picker page. */
export const useTablesFilter = create<TablesFilterState>((set) => ({
  floorId: ALL_FLOORS,
  setFloorId: (floorId) => set({ floorId }),
}));
