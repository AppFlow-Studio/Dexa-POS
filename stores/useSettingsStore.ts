import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mmkvStorage } from "@/lib/storage";

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

// Staff Permissions
export interface Permission {
  id: number;
  name: string;
  admin: boolean;
  manager: boolean;
  server: boolean;
  kitchen: boolean;
  host: boolean;
}

export interface ClockInSettings {
  pinRequired: boolean;
  photoRequired: boolean;
  preventEarlyClockIn: boolean;
  preventOpenOrdersClockOut: boolean;
}

// Payment Systems
export interface DualPricingSettings {
  enabled: boolean;
  discount: string;
  signageChecklist: {
    priceDisplay: boolean;
    registerSign: boolean;
    entranceSign: boolean;
    menuNote: boolean;
  };
}

export interface SurchargingSettings {
  enabled: boolean;
  rate: string;
  selectedState: string;
  signageAcknowledged: boolean;
}

export interface FundingSettings {
  instant: boolean;
  balance: number;
}

export interface ThrottlingSettings {
  enabled: boolean;
  capacity: number;
  currentLoad: number;
  pauseOnline: boolean;
  increasePrepTime: boolean;
  alertManager: boolean;
}

export interface PrepCategory {
  id: string;
  name: string;
  minutes: number;
}

interface DeliverySettings {
  batchOrdersByZone: boolean;
  delayOrdersToBatch: boolean;
  maxBatchDelayMinutes: number;
  prioritizeDeliveryOrders: boolean;
  autoCalculateByDistance: boolean;
  zones: DeliveryZone[];
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
  enablePerSeatOrdering: boolean;
  enableCoursing: boolean;
}

/** Subset of dining settings that sync across stations via Supabase */
export interface SyncableDiningSettings {
  enablePerSeatOrdering: boolean;
  enableCoursing: boolean;
  allowTableMerging: boolean;
  allowTableSplitting: boolean;
  autoUpdateTableStatus: boolean;
  defaultSittingTimeMinutes: number;
  defaultPartySize: number;
}

export interface OrderLineSettings {
  /** Number of days of orders to show. 0 = today only, 1 = today + yesterday, etc. */
  daysToShow: number;
}

interface SettingsState extends DiningRoomSettings, DeliverySettings {
  defaultSittingTimeMinutes: number;

  // Staff Permissions
  permissions: Permission[];
  clockInSettings: ClockInSettings;

  // Payment Systems
  dualPricing: DualPricingSettings;
  surcharging: SurchargingSettings;
  funding: FundingSettings;
  tokenizationEnabled: boolean;
  textToPayEnabled: boolean;
  throttling: ThrottlingSettings;
  kdsEnabled: boolean;
  prepCategories: PrepCategory[];
  showPrepTimesToCustomers: boolean;
  autoAdjustPrepTimes: boolean;

  // Order Line
  orderLineSettings: OrderLineSettings;

  // Menu Display
  showMenuItemPrices: boolean;
  setShowMenuItemPrices: (show: boolean) => void;
  showMenuImages: boolean;
  setShowMenuImages: (show: boolean) => void;

  // Actions
  setDefaultSittingTimeMinutes: (minutes: number) => void;
  setOrderLineSettings: (settings: Partial<OrderLineSettings>) => void;
  updateDiningSettings: (settings: Partial<Omit<SettingsState, "updateDiningSettings" | "setDefaultSittingTimeMinutes" | "updateDeliverySettings" | "toggleDeliveryPartnerStatus" | "setPermissions" | "togglePermission" | "setClockInSettings" | "setDualPricing" | "setSurcharging" | "setFunding" | "setThrottling" | "setPrepCategories" | "adjustPrepTime">>) => void;
  updateDeliverySettings: (settings: Partial<DeliverySettings>) => void;
  toggleDeliveryPartnerStatus: (partnerId: string) => void;

  // Staff permissions actions
  setPermissions: (permissions: Permission[]) => void;
  togglePermission: (permId: number, role: keyof Permission) => void;
  setClockInSettings: (settings: Partial<ClockInSettings>) => void;

  // Payment systems actions
  setDualPricing: (settings: Partial<DualPricingSettings>) => void;
  setSurcharging: (settings: Partial<SurchargingSettings>) => void;
  setFunding: (settings: Partial<FundingSettings>) => void;
  setThrottling: (settings: Partial<ThrottlingSettings>) => void;
  setPrepCategories: (categories: PrepCategory[]) => void;
  adjustPrepTime: (id: string, delta: number) => void;
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
  enablePerSeatOrdering: false,
  enableCoursing: true,
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
    { id: "doordash", name: "DoorDash", status: "Active", commission: 25, orders: 347, revenue: 8437 },
    { id: "ubereats", name: "UberEats", status: "Active", commission: 28, orders: 289, revenue: 7124 },
    { id: "grubhub", name: "Grubhub", status: "Paused", commission: 23, orders: 0, revenue: 0 },
    { id: "self", name: "Self-Delivery", status: "Active", commission: 0, orders: 142, revenue: 6247 },
  ],
};

const initialPermissions: Permission[] = [
  { id: 1, name: "Void Orders", admin: true, manager: true, server: false, kitchen: false, host: false },
  { id: 2, name: "Refund Payments", admin: true, manager: true, server: false, kitchen: false, host: false },
  { id: 3, name: "Discount Items", admin: true, manager: true, server: true, kitchen: false, host: false },
  { id: 4, name: "Access Settings", admin: true, manager: false, server: false, kitchen: false, host: false },
  { id: 5, name: "View Reports", admin: true, manager: true, server: false, kitchen: false, host: false },
  { id: 6, name: "Manage Staff", admin: true, manager: true, server: false, kitchen: false, host: false },
  { id: 7, name: "Edit Menu", admin: true, manager: true, server: false, kitchen: true, host: false },
  { id: 8, name: "Close Registers", admin: true, manager: true, server: false, kitchen: false, host: false },
  { id: 9, name: "Accept Returns", admin: true, manager: true, server: true, kitchen: false, host: false },
  { id: 10, name: "Override Prices", admin: true, manager: true, server: false, kitchen: false, host: false },
  { id: 11, name: "View Payroll", admin: true, manager: false, server: false, kitchen: false, host: false },
  { id: 12, name: "Manage Inventory", admin: true, manager: true, server: false, kitchen: true, host: false },
  { id: 13, name: "Delete Orders", admin: true, manager: false, server: false, kitchen: false, host: false },
  { id: 14, name: "Access Admin Panel", admin: true, manager: false, server: false, kitchen: false, host: false },
  { id: 15, name: "Export Data", admin: true, manager: true, server: false, kitchen: false, host: false },
];

const initialClockInSettings: ClockInSettings = {
  pinRequired: true,
  photoRequired: false,
  preventEarlyClockIn: true,
  preventOpenOrdersClockOut: true,
};

const initialDualPricing: DualPricingSettings = {
  enabled: true,
  discount: "3.5",
  signageChecklist: { priceDisplay: true, registerSign: true, entranceSign: false, menuNote: true },
};

const initialSurcharging: SurchargingSettings = {
  enabled: false,
  rate: "3.99",
  selectedState: "California",
  signageAcknowledged: false,
};

const initialThrottling: ThrottlingSettings = {
  enabled: true,
  capacity: 75,
  currentLoad: 68,
  pauseOnline: true,
  increasePrepTime: true,
  alertManager: true,
};

const initialPrepCategories: PrepCategory[] = [
  { id: "1", name: "Appetizers", minutes: 8 },
  { id: "2", name: "Entrees", minutes: 15 },
  { id: "3", name: "Sides", minutes: 5 },
  { id: "4", name: "Desserts", minutes: 10 },
  { id: "5", name: "Drinks", minutes: 3 },
];

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultSittingTimeMinutes: 60,
      ...initialDiningSettings,
      ...initialDeliverySettings,

      // Staff Permissions
      permissions: initialPermissions,
      clockInSettings: initialClockInSettings,

      // Payment Systems
      dualPricing: initialDualPricing,
      surcharging: initialSurcharging,
      funding: { instant: false, balance: 2450.0 },
      tokenizationEnabled: true,
      textToPayEnabled: false,
      throttling: initialThrottling,
      kdsEnabled: true,
      prepCategories: initialPrepCategories,
      showPrepTimesToCustomers: true,
      autoAdjustPrepTimes: true,

      // Order Line
      orderLineSettings: { daysToShow: 0 },

      // Menu Display
      showMenuItemPrices: true,
      setShowMenuItemPrices: (show) => set({ showMenuItemPrices: show }),
      showMenuImages: true,
      setShowMenuImages: (show) => set({ showMenuImages: show }),

      setDefaultSittingTimeMinutes: (minutes) => set({ defaultSittingTimeMinutes: minutes }),

      updateDiningSettings: (settings) => set((state) => ({ ...state, ...settings })),

      updateDeliverySettings: (settings) => set((state) => ({ ...state, ...settings })),

      toggleDeliveryPartnerStatus: (partnerId) => set((state) => ({
        partners: state.partners.map((p) => p.id === partnerId ? { ...p, status: p.status === "Active" ? "Paused" : "Active" } : p),
      })),

      // Staff permissions actions
      setPermissions: (permissions) => set({ permissions }),

      togglePermission: (permId, role) => set((state) => ({
        permissions: state.permissions.map((p) => p.id === permId ? { ...p, [role]: !p[role as keyof Permission] } : p),
      })),

      setClockInSettings: (settings) => set((state) => ({ clockInSettings: { ...state.clockInSettings, ...settings } })),

      // Payment systems actions
      setDualPricing: (settings) => set((state) => ({ dualPricing: { ...state.dualPricing, ...settings } })),

      setSurcharging: (settings) => set((state) => ({ surcharging: { ...state.surcharging, ...settings } })),

      setFunding: (settings) => set((state) => ({ funding: { ...state.funding, ...settings } })),

      setThrottling: (settings) => set((state) => ({ throttling: { ...state.throttling, ...settings } })),

      setPrepCategories: (categories) => set({ prepCategories: categories }),

      adjustPrepTime: (id, delta) => set((state) => ({
        prepCategories: state.prepCategories.map((c) => c.id === id ? { ...c, minutes: Math.max(1, c.minutes + delta) } : c),
      })),

      setOrderLineSettings: (settings) => set((state) => ({
        orderLineSettings: { ...state.orderLineSettings, ...settings },
      })),
    }),
    {
      name: "settings-storage",
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        // Dining
        tablePrefix: state.tablePrefix,
        tableStartNumber: state.tableStartNumber,
        defaultPartySize: state.defaultPartySize,
        allowTableMerging: state.allowTableMerging,
        mergeTimeoutMinutes: state.mergeTimeoutMinutes,
        allowTableSplitting: state.allowTableSplitting,
        autoUpdateTableStatus: state.autoUpdateTableStatus,
        autoRotateSections: state.autoRotateSections,
        balanceSectionLoad: state.balanceSectionLoad,
        enablePerSeatOrdering: state.enablePerSeatOrdering,
        enableCoursing: state.enableCoursing,
        defaultSittingTimeMinutes: state.defaultSittingTimeMinutes,
        // KDS
        kdsEnabled: state.kdsEnabled,
        // Menu Display
        showMenuItemPrices: state.showMenuItemPrices,
        showMenuImages: state.showMenuImages,
        // Order Line
        orderLineSettings: state.orderLineSettings,
      }),
    }
  )
);
