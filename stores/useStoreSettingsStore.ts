import { toastService } from "@/lib/toastService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// Selected location from Supabase
export interface SelectedLocation {
  id: string;
  merchant_id: string;
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  timezone: string;
  is_active: boolean;
  is_accepting_orders: boolean;
  business_hours: Record<
    string,
    { open: string; close: string; is_closed: boolean }
  >;
  created_at: string;
  updated_at: string;
}

export interface StoreSettings {
  // Tax Settings (local app settings)
  storeTaxId: string;
  defaultTaxRate: number;
  ptoAccrualRate: number;
  minimumPtoNoticeDays: number;
  targetLaborPercent: number;

  // Scheduling
  scheduling: {
    autoDetectConflicts: boolean;
    conflictTypes: {
      doubleBooked: boolean;
      overtime: boolean;
      minStaffing: boolean;
      backToBack: boolean;
      // Add other conflict types here as needed
    };
  };

  // Employee Settings
  isBreakAndSwitchEnabled: boolean;

  // Online Ordering Settings
  onlineOrderingEnabled: boolean;
  onlinePauseReason: string | null;
  autoResumeTime: string | null; // ISO date

  // Order Acceptance
  autoAcceptOrders: boolean;
  largeOrderApprovalThreshold: number;
  rejectWhenBusyThreshold: number; // 0 = disabled

  // Dynamic Prep Times
  dynamicPrepTimeEnabled: boolean;
  basePrepTime: number; // minutes
  prepTimeAdjustments: {
    kitchenLoad: boolean; // +10m if >25 orders
    peakHours: boolean; // +5m 5-8PM
    weather: boolean; // +15m if bad weather (simulated)
  };

  // Pre-Ordering
  preOrderingEnabled: boolean;
  preOrderMaxDays: number;
  preOrderMinAdvanceMinutes: number;
  preOrderMaxDaily: number;

  // Selected store from database
  selectedStore: SelectedLocation | null;
}

interface StoreSettingsState extends StoreSettings {
  isDirty: boolean;
  initialState: StoreSettings; // To compare for changes
  updateField: <K extends keyof StoreSettings>(
    field: K,
    value: StoreSettings[K]
  ) => void;
  setIsBreakAndSwitchEnabled: (isEnabled: boolean) => void;
  setPtoAccrualRate: (rate: number) => void; // New action
  setTargetLaborPercent: (percent: number) => void;
  // Generic update for nested objects like prepTimeAdjustments
  updatePrepAdjustment: (
    key: keyof StoreSettings["prepTimeAdjustments"],
    value: boolean
  ) => void;
  updateSchedulingSettings: (
    updates: Partial<StoreSettings["scheduling"]>
  ) => void;
  saveChanges: () => void;
  discardChanges: () => void;

  // Selected store actions
  setSelectedStore: (store: SelectedLocation) => void;
  clearSelectedStore: () => void;
}

const initialData: StoreSettings = {
  // Tax Settings
  storeTaxId: "US123456789",
  defaultTaxRate: 8.25,
  ptoAccrualRate: 0.0375,
  minimumPtoNoticeDays: 7,
  targetLaborPercent: 25,

  // Scheduling Defaults
  scheduling: {
    autoDetectConflicts: true,
    conflictTypes: {
      doubleBooked: true,
      overtime: true,
      minStaffing: true,
      backToBack: true,
    },
  },

  isBreakAndSwitchEnabled: true, // Enabled by default

  // Online Ordering Defaults
  onlineOrderingEnabled: true,
  onlinePauseReason: null,
  autoResumeTime: null,
  autoAcceptOrders: false,
  largeOrderApprovalThreshold: 200,
  rejectWhenBusyThreshold: 35,
  dynamicPrepTimeEnabled: true,
  basePrepTime: 25,
  prepTimeAdjustments: {
    kitchenLoad: true,
    peakHours: true,
    weather: false,
  },
  preOrderingEnabled: true,
  preOrderMaxDays: 30,
  preOrderMinAdvanceMinutes: 120, // 2 hours
  preOrderMaxDaily: 25,

  // No store selected initially
  selectedStore: null,
};

export const useStoreSettingsStore = create<StoreSettingsState>()(
  persist(
    (set, get) => ({
      ...initialData,
      initialState: { ...initialData },
      isDirty: false,

      updateField: (field, value) => {
        set((state) => {
          const newState = { ...state, [field]: value };
          const isDirty =
            JSON.stringify(newState.initialState) !==
            JSON.stringify({
              ...newState,
              initialState: undefined, // Exclude these from comparison
              isDirty: undefined,
            });
          return { ...newState, isDirty };
        });
      },

      setIsBreakAndSwitchEnabled: (isEnabled: boolean) => {
        set((state) => {
          const newState = { ...state, isBreakAndSwitchEnabled: isEnabled };
          const isDirty =
            JSON.stringify(newState.initialState) !==
            JSON.stringify({
              ...newState,
              initialState: undefined,
              isDirty: undefined,
            });
          return { ...newState, isDirty };
        });
      },

      setPtoAccrualRate: (rate: number) => {
        set((state) => {
          const newState = { ...state, ptoAccrualRate: rate };
          const isDirty =
            JSON.stringify(newState.initialState) !==
            JSON.stringify({
              ...newState,
              initialState: undefined,
              isDirty: undefined,
            });
          return { ...newState, isDirty };
        });
      },

      setTargetLaborPercent: (percent: number) => {
        set((state) => {
          const newState = { ...state, targetLaborPercent: percent };
          const isDirty =
            JSON.stringify(newState.initialState) !==
            JSON.stringify({
              ...newState,
              initialState: undefined,
              isDirty: undefined,
            });
          return { ...newState, isDirty };
        });
      },

      updatePrepAdjustment: (key, value) => {
        set((state) => {
          const newAdjustments = { ...state.prepTimeAdjustments, [key]: value };
          const newState = { ...state, prepTimeAdjustments: newAdjustments };

          // Calculate dirty state
          const isDirty =
            JSON.stringify(newState.initialState) !==
            JSON.stringify({
              ...newState,
              initialState: undefined,
              isDirty: undefined,
            });

          return { ...newState, isDirty };
        });
      },

      updateSchedulingSettings: (
        updates: Partial<StoreSettings["scheduling"]>
      ) => {
        set((state) => {
          const newScheduling = { ...state.scheduling, ...updates };
          // Deep merge for nested conflictTypes if provided
          if (updates.conflictTypes) {
            newScheduling.conflictTypes = {
              ...state.scheduling.conflictTypes,
              // We can just replace it or merge it. Since we pass the whole object from UI usually, replacing is fine,
              // but let's be safe and merge if only partial is passed (though Partial<Scheduling> implies top level).
              // Actually, let's treat conflictTypes as a replacement if present in updates, OR merging carefully.
              // For simplicity in this specific store pattern, let's assume the UI sends the full object or we merge carefully.
              // Wait, the updates param is Partial<Scheduling>.
              // conflictTypes is optional in that partial.
              // Let's do a merge:
              ...updates.conflictTypes,
            };
          }

          const newState = { ...state, scheduling: newScheduling };

          const isDirty =
            JSON.stringify(newState.initialState) !==
            JSON.stringify({
              ...newState,
              initialState: undefined,
              isDirty: undefined,
            });

          return { ...newState, isDirty };
        });
      },

      saveChanges: () => {
        const currentState = get();
        const updatedState = { ...currentState };
        delete (updatedState as any).initialState;
        delete (updatedState as any).isDirty;

        const newInitialState = { ...updatedState };

        set({ initialState: newInitialState, isDirty: false });

        toastService.show({
          title: "Settings Saved",
          message: "Store information has been updated successfully.",
          type: "success",
        });
      },

      discardChanges: () => {
        const { initialState } = get();
        set({ ...initialState, isDirty: false });
      },

      // Selected store actions
      setSelectedStore: (store: SelectedLocation) => {
        set({ selectedStore: store });
      },

      clearSelectedStore: () => {
        set({ selectedStore: null });
      },
    }),
    {
      name: "store-settings-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Only persist these fields
        selectedStore: state.selectedStore,
        storeTaxId: state.storeTaxId,
        defaultTaxRate: state.defaultTaxRate,
        ptoAccrualRate: state.ptoAccrualRate,
        minimumPtoNoticeDays: state.minimumPtoNoticeDays,
        targetLaborPercent: state.targetLaborPercent,
        scheduling: state.scheduling,
        isBreakAndSwitchEnabled: state.isBreakAndSwitchEnabled,
        onlineOrderingEnabled: state.onlineOrderingEnabled,
        onlinePauseReason: state.onlinePauseReason,
        autoResumeTime: state.autoResumeTime,
        autoAcceptOrders: state.autoAcceptOrders,
        largeOrderApprovalThreshold: state.largeOrderApprovalThreshold,
        rejectWhenBusyThreshold: state.rejectWhenBusyThreshold,
        dynamicPrepTimeEnabled: state.dynamicPrepTimeEnabled,
        basePrepTime: state.basePrepTime,
        prepTimeAdjustments: state.prepTimeAdjustments,
        preOrderingEnabled: state.preOrderingEnabled,
        preOrderMaxDays: state.preOrderMaxDays,
        preOrderMinAdvanceMinutes: state.preOrderMinAdvanceMinutes,
        preOrderMaxDaily: state.preOrderMaxDaily,
      }),
    }
  )
);
