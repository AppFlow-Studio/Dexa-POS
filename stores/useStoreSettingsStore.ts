import { toastService } from "@/lib/toastService";
import { Address, DayHours, SpecialHours } from "@/lib/types"; // We will add these types next
import { create } from "zustand";

export interface StoreSettings {
  storeName: string;
  address: Address;
  phone: string;
  email: string;
  website: string;
  hours: DayHours[];
  specialHours: SpecialHours[];
  storeTaxId: string;
  defaultTaxRate: number;
  ptoAccrualRate: number;
  minimumPtoNoticeDays: number;
  targetLaborPercent: number;

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
}

interface StoreSettingsState extends StoreSettings {
  isDirty: boolean;
  initialState: StoreSettings; // To compare for changes
  updateField: <K extends keyof StoreSettings>(
    field: K,
    value: StoreSettings[K]
  ) => void;
  setPtoAccrualRate: (rate: number) => void; // New action
  setTargetLaborPercent: (percent: number) => void;
  // Generic update for nested objects like prepTimeAdjustments
  updatePrepAdjustment: (
    key: keyof StoreSettings["prepTimeAdjustments"],
    value: boolean
  ) => void;
  saveChanges: () => void;
  discardChanges: () => void;
}

const initialData: StoreSettings = {
  storeName: "John's Gourmet Market",
  address: {
    street: "123 Main St",
    city: "Anytown",
    state: "CA",
    zip: "12345",
  },
  phone: "555-123-4567",
  email: "contact@jgourmet.com",
  website: "https://jgourmet.com",
  hours: [
    { day: "Monday", open: "09:00", close: "21:00", enabled: true },
    { day: "Tuesday", open: "09:00", close: "21:00", enabled: true },
    { day: "Wednesday", open: "09:00", close: "21:00", enabled: true },
    { day: "Thursday", open: "09:00", close: "21:00", enabled: true },
    { day: "Friday", open: "09:00", close: "22:00", enabled: true },
    { day: "Saturday", open: "10:00", close: "22:00", enabled: true },
    { day: "Sunday", open: "10:00", close: "20:00", enabled: false },
  ],
  specialHours: [],
  storeTaxId: "US123456789",
  defaultTaxRate: 8.25,
  ptoAccrualRate: 0.0375,
  minimumPtoNoticeDays: 7,
  targetLaborPercent: 25,

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
};

export const useStoreSettingsStore = create<StoreSettingsState>((set, get) => ({
  ...initialData,
  initialState: { ...initialData }, // Store a copy for reset/dirty checking
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
}));
