import { create } from "zustand";

export interface DeliveryPartner {
  id: string;
  name: string;
  status: "Active" | "Paused" | "Inactive";
  commission: number;
  orders: number;
  revenue: number;
}

export interface DeliveryZone {
  id: string;
  name: string;
  distanceRange: string;
  fee: number;
  eta: number;
}

interface DeliverySettings {
  // Optimization
  batchOrdersByZone: boolean;
  delayOrdersToBatch: boolean;
  maxBatchDelayMinutes: number;
  prioritizeDeliveryOrders: boolean;

  // Zones
  autoCalculateByDistance: boolean;
  zones: DeliveryZone[];

  // Partners
  partners: DeliveryPartner[];
}

interface DiningRoomSettings {
  tablePrefix: string;
  tableStartNumber: number;
  defaultPartySize: number;
  allowTableMerging: boolean;
  mergeTimeoutMinutes: number;
  allowTableSplitting: boolean;
  autoUpdateTableStatus: boolean;
  autoRotateSections: boolean;
  balanceSectionLoad: boolean;
}

interface SettingsState extends DiningRoomSettings, DeliverySettings {
  defaultSittingTimeMinutes: number;
  setDefaultSittingTimeMinutes: (minutes: number) => void;

  updateDiningSettings: (
    settings: Partial<
      Omit<
        SettingsState,
        | "updateDiningSettings"
        | "setDefaultSittingTimeMinutes"
        | "updateDeliverySettings"
        | "toggleDeliveryPartnerStatus"
      >
    >
  ) => void;

  updateDeliverySettings: (settings: Partial<DeliverySettings>) => void;
  toggleDeliveryPartnerStatus: (partnerId: string) => void;
}

const initialDiningSettings: DiningRoomSettings = {
  tablePrefix: "T",
  tableStartNumber: 1,
  defaultPartySize: 2,
  allowTableMerging: true,
  mergeTimeoutMinutes: 0,
  allowTableSplitting: false,
  autoUpdateTableStatus: true,
  autoRotateSections: false,
  balanceSectionLoad: true,
};

const initialDeliverySettings: DeliverySettings = {
  batchOrdersByZone: true,
  delayOrdersToBatch: true,
  maxBatchDelayMinutes: 15,
  prioritizeDeliveryOrders: false,
  autoCalculateByDistance: true,
  zones: [
    { id: "1", name: "Zone 1", distanceRange: "0-2 mi", fee: 3.0, eta: 25 },
    { id: "2", name: "Zone 2", distanceRange: "2-4 mi", fee: 5.0, eta: 35 },
    { id: "3", name: "Zone 3", distanceRange: "4-6 mi", fee: 8.0, eta: 45 },
  ],
  partners: [
    {
      id: "doordash",
      name: "DoorDash",
      status: "Active",
      commission: 25,
      orders: 347,
      revenue: 8437,
    },
    {
      id: "ubereats",
      name: "UberEats",
      status: "Active",
      commission: 28,
      orders: 289,
      revenue: 7124,
    },
    {
      id: "grubhub",
      name: "Grubhub",
      status: "Paused",
      commission: 23,
      orders: 0,
      revenue: 0,
    },
    {
      id: "self",
      name: "Self-Delivery",
      status: "Active",
      commission: 0,
      orders: 142,
      revenue: 6247,
    },
  ],
};

export const useSettingsStore = create<SettingsState>((set) => ({
  // Default to 60 minutes (1 Hour)
  defaultSittingTimeMinutes: 60,

  ...initialDiningSettings,
  ...initialDeliverySettings,

  setDefaultSittingTimeMinutes: (minutes) => {
    set({ defaultSittingTimeMinutes: minutes });
  },

  updateDiningSettings: (settings) => {
    set((state) => ({ ...state, ...settings }));
  },

  updateDeliverySettings: (settings) => {
    set((state) => ({ ...state, ...settings }));
  },

  toggleDeliveryPartnerStatus: (partnerId) => {
    set((state) => ({
      partners: state.partners.map((p) =>
        p.id === partnerId
          ? {
              ...p,
              status: p.status === "Active" ? "Paused" : "Active",
            }
          : p
      ),
    }));
  },
}));
