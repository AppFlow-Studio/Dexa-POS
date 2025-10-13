import { Address, DayHours, SpecialHours } from "@/lib/types"; // We will add these types next
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
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
}

interface StoreSettingsState extends StoreSettings {
  isDirty: boolean;
  initialState: StoreSettings; // To compare for changes
  updateField: <K extends keyof StoreSettings>(
    field: K,
    value: StoreSettings[K]
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

  saveChanges: () => {
    const currentState = get();
    const updatedState = { ...currentState };
    delete (updatedState as any).initialState;
    delete (updatedState as any).isDirty;

    const newInitialState = { ...updatedState };

    set({ initialState: newInitialState, isDirty: false });

    toast.success("Store info updated successfully.", {
      position: ToastPosition.BOTTOM,
    });
  },

  discardChanges: () => {
    const { initialState } = get();
    set({ ...initialState, isDirty: false });
  },
}));
