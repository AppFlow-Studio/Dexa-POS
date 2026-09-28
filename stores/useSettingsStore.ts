import { createLazyPersistStorage } from "@/lib/storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ThrottlingSettings {
  enabled: boolean;
  capacity: number;
  maxCapacity: number;
  pauseOnline: boolean;
  increasePrepTime: boolean;
  alertManager: boolean;
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
  /** Controls how order line entries are presented in order-processing. */
  viewMode: "default" | "minimal";
  /** Controls minimal-mode sheet height profile. */
  minimalModeRows: 2 | 3;
}

export type PosMenuNavigationMode = "popup" | "classic";

interface SettingsState extends DiningRoomSettings {
  defaultSittingTimeMinutes: number;

  throttling: ThrottlingSettings;

  // Printer Assignment (per-station, persisted locally via MMKV)
  defaultReceiptPrinterId: string | null;
  setDefaultReceiptPrinterId: (printerId: string | null) => void;

  // KDS auto-print: when this device is a KDS station, physically print each
  // ticket that lands on the board to the printer this station has claimed.
  // Device-local (a printer is a per-device concern) + off by default — the
  // kill switch for the whole KDS-print feature on this device.
  kdsAutoPrintEnabled: boolean;
  setKdsAutoPrintEnabled: (enabled: boolean) => void;

  // Order Line
  orderLineSettings: OrderLineSettings;

  // Performance diagnostics (Wave-0 rush-lag telemetry harness)
  telemetryEnabled: boolean;
  setTelemetryEnabled: (enabled: boolean) => void;

  // Menu Display
  showMenuItemPrices: boolean;
  setShowMenuItemPrices: (show: boolean) => void;
  showMenuImages: boolean;
  setShowMenuImages: (show: boolean) => void;
  posMenuNavigationMode: PosMenuNavigationMode;
  setPosMenuNavigationMode: (mode: PosMenuNavigationMode) => void;
  // When a required modifier group has no preset default, auto-select the
  // first free (then first available) option. Off = require manual selection.
  autoSelectFirstRequiredOption: boolean;
  setAutoSelectFirstRequiredOption: (value: boolean) => void;

  // UI Scale Override
  uiScaleOverride: number | null;
  setUiScaleOverride: (value: number | null) => void;

  // Customer-Facing Display (CFD) scale override. Deliberately independent of
  // `uiScaleOverride`: the CFD is a physically separate screen (external
  // tablet or on-device secondary display) read by a customer at a different
  // distance, so it gets its own multiplier. `null` = follow the CFD's own
  // automatic scale with no operator override.
  cfdUiScaleOverride: number | null;
  setCfdUiScaleOverride: (value: number | null) => void;
  setDefaultSittingTimeMinutes: (minutes: number) => void;
  setOrderLineSettings: (settings: Partial<OrderLineSettings>) => void;
  updateDiningSettings: (
    settings: Partial<
      Omit<
        SettingsState,
        | "updateDiningSettings"
        | "setDefaultSittingTimeMinutes"
        | "setThrottling"
      >
    >,
  ) => void;
  setThrottling: (settings: Partial<ThrottlingSettings>) => void;
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

const initialThrottling: ThrottlingSettings = {
  enabled: true,
  capacity: 75,
  maxCapacity: 100,
  pauseOnline: true,
  increasePrepTime: true,
  alertManager: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      defaultSittingTimeMinutes: 60,
      ...initialDiningSettings,

      throttling: initialThrottling,

      // Printer Assignment
      defaultReceiptPrinterId: null,
      setDefaultReceiptPrinterId: (printerId) =>
        set({ defaultReceiptPrinterId: printerId }),

      // KDS auto-print (device-local; only meaningful on a KDS station)
      kdsAutoPrintEnabled: false,
      setKdsAutoPrintEnabled: (enabled) =>
        set({ kdsAutoPrintEnabled: enabled }),

      // Order Line
      orderLineSettings: {
        daysToShow: 0,
        viewMode: "default",
        minimalModeRows: 3,
      },

      // Performance diagnostics — default OFF (the Wave-0 pilot is over). When
      // on it runs a 50ms long-task watcher and a 30s ring flush all shift,
      // which low-end devices shouldn't pay for unless someone is measuring.
      // Turn it on per device in Settings > General.
      telemetryEnabled: false,
      setTelemetryEnabled: (enabled) => set({ telemetryEnabled: enabled }),

      // Menu Display
      showMenuItemPrices: true,
      setShowMenuItemPrices: (show) => set({ showMenuItemPrices: show }),
      showMenuImages: true,
      setShowMenuImages: (show) => set({ showMenuImages: show }),
      posMenuNavigationMode: "classic",
      setPosMenuNavigationMode: (mode) => set({ posMenuNavigationMode: mode }),
      autoSelectFirstRequiredOption: true,
      setAutoSelectFirstRequiredOption: (value) =>
        set({ autoSelectFirstRequiredOption: value }),

      // UI Scale Override
      uiScaleOverride: null,
      cfdUiScaleOverride: null,

      setDefaultSittingTimeMinutes: (minutes) =>
        set({ defaultSittingTimeMinutes: minutes }),

      updateDiningSettings: (settings) =>
        set((state) => ({ ...state, ...settings })),

      setThrottling: (settings) =>
        set((state) => ({ throttling: { ...state.throttling, ...settings } })),

      setUiScaleOverride: (value) => set({ uiScaleOverride: value }),

      setCfdUiScaleOverride: (value) => set({ cfdUiScaleOverride: value }),

      setOrderLineSettings: (settings) =>
        set((state) => ({
          orderLineSettings: { ...state.orderLineSettings, ...settings },
        })),
    }),
    {
      name: "settings-storage",
      storage: createLazyPersistStorage(),
      version: 2,
      migrate: (persistedState, version) => {
        const state = persistedState as any;
        // v2: telemetry default flipped to OFF. Devices persisted under v1
        // still carry the old ON default, so switch them off once; anyone
        // measuring can turn it back on in Settings > General.
        if (version < 2 && state) state.telemetryEnabled = false;
        return state;
      },
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
        kdsAutoPrintEnabled: state.kdsAutoPrintEnabled,
        // Performance diagnostics
        telemetryEnabled: state.telemetryEnabled,
        // Menu Display
        showMenuItemPrices: state.showMenuItemPrices,
        showMenuImages: state.showMenuImages,
        posMenuNavigationMode: state.posMenuNavigationMode,
        autoSelectFirstRequiredOption: state.autoSelectFirstRequiredOption,
        // Order Line
        orderLineSettings: state.orderLineSettings,
        // UI Scale Override
        uiScaleOverride: state.uiScaleOverride,
        cfdUiScaleOverride: state.cfdUiScaleOverride,
      }),
    },
  ),
);
