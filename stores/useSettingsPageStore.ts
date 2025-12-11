import { create } from "zustand";

// ==================== TYPES ====================

// General Settings
export interface OperatingHours {
    [day: string]: { open: string; close: string; enabled: boolean };
}

export interface BusinessInfo {
    name: string;
    address: string;
    phone: string;
    website: string;
    email: string;
}

export interface TaxSettings {
    enabled: boolean;
    rate: string;
    inclusive: boolean;
    label: string;
}

export interface ServiceCharge {
    enabled: boolean;
    autoGratuity: boolean;
    largePartySize: string;
    rate: string;
}

// Staff & Permissions
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

// Printers & Kitchen
export interface PrinterDevice {
    id: string;
    name: string;
    type: "receipt" | "kitchen" | "label";
    connectionType: "wifi" | "bluetooth" | "usb";
    status: "online" | "offline" | "error";
    ipAddress?: string;
    isEnabled: boolean;
}

export interface ReceiptSettings {
    showTaxBreakdown: boolean;
    showItemizedList: boolean;
    showTips: boolean;
    printCustomerCopy: boolean;
    footerMessage: string;
}

export interface KitchenSettings {
    autoFireTickets: boolean;
    fireDelay: number;
    printVoidTickets: boolean;
    showGuestCount: boolean;
    showModifiers: boolean;
    showCourseNumber: boolean;
    showServerName: boolean;
    largeFont: boolean;
}

export interface PrinterRoute {
    id: string;
    category: string;
    printerId: string;
    isEnabled: boolean;
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

export interface TokenizationSettings {
    enabled: boolean;
}

export interface TextToPaySettings {
    enabled: boolean;
    testSent: boolean;
}

export interface ThrottlingSettings {
    enabled: boolean;
    capacity: number;
    currentLoad: number;
    pauseOnline: boolean;
    increasePrepTime: boolean;
    alertManager: boolean;
}

export interface KDSSettings {
    enabled: boolean;
}

export interface PrepTimeSettings {
    showToCustomers: boolean;
    autoAdjust: boolean;
    currentAdjustment: number;
}

export interface PrepCategory {
    id: string;
    name: string;
    minutes: number;
}

// ==================== STORE STATE ====================

interface SettingsPageState {
    // General Settings
    businessInfo: BusinessInfo;
    operatingHours: OperatingHours;
    taxSettings: TaxSettings;
    serviceCharge: ServiceCharge;

    // Staff & Permissions
    permissions: Permission[];
    clockInSettings: ClockInSettings;

    // Printers & Kitchen
    printers: PrinterDevice[];
    receiptSettings: ReceiptSettings;
    kitchenSettings: KitchenSettings;
    printerRoutes: PrinterRoute[];

    // Payment Systems
    dualPricing: DualPricingSettings;
    surcharging: SurchargingSettings;
    funding: FundingSettings;
    tokenization: TokenizationSettings;
    textToPay: TextToPaySettings;
    throttling: ThrottlingSettings;
    kds: KDSSettings;
    prepTimes: PrepTimeSettings;
    prepCategories: PrepCategory[];

    // Actions
    setBusinessInfo: (info: Partial<BusinessInfo>) => void;
    setOperatingHours: (hours: OperatingHours) => void;
    updateDayHours: (day: string, data: Partial<OperatingHours[string]>) => void;
    setTaxSettings: (settings: Partial<TaxSettings>) => void;
    setServiceCharge: (settings: Partial<ServiceCharge>) => void;

    setPermissions: (permissions: Permission[]) => void;
    togglePermission: (permId: number, role: keyof Permission) => void;
    setClockInSettings: (settings: Partial<ClockInSettings>) => void;

    setPrinters: (printers: PrinterDevice[]) => void;
    addPrinter: (printer: PrinterDevice) => void;
    updatePrinter: (id: string, data: Partial<PrinterDevice>) => void;
    removePrinter: (id: string) => void;
    setReceiptSettings: (settings: Partial<ReceiptSettings>) => void;
    setKitchenSettings: (settings: Partial<KitchenSettings>) => void;
    setPrinterRoutes: (routes: PrinterRoute[]) => void;
    addPrinterRoute: (route: PrinterRoute) => void;
    updatePrinterRoute: (id: string, data: Partial<PrinterRoute>) => void;

    setDualPricing: (settings: Partial<DualPricingSettings>) => void;
    setSurcharging: (settings: Partial<SurchargingSettings>) => void;
    setFunding: (settings: Partial<FundingSettings>) => void;
    setTokenization: (settings: Partial<TokenizationSettings>) => void;
    setTextToPay: (settings: Partial<TextToPaySettings>) => void;
    setThrottling: (settings: Partial<ThrottlingSettings>) => void;
    setKds: (settings: Partial<KDSSettings>) => void;
    setPrepTimes: (settings: Partial<PrepTimeSettings>) => void;
    setPrepCategories: (categories: PrepCategory[]) => void;
    adjustPrepTime: (id: string, delta: number) => void;
}

// ==================== INITIAL STATE ====================

const initialBusinessInfo: BusinessInfo = {
    name: "Dexa POS",
    address: "123 Main St, Suite 100",
    phone: "(555) 123-4567",
    website: "www.dexapos.com",
    email: "contact@dexapos.com",
};

const initialOperatingHours: OperatingHours = {
    Monday: { open: "09:00 AM", close: "10:00 PM", enabled: true },
    Tuesday: { open: "09:00 AM", close: "10:00 PM", enabled: true },
    Wednesday: { open: "09:00 AM", close: "10:00 PM", enabled: true },
    Thursday: { open: "09:00 AM", close: "10:00 PM", enabled: true },
    Friday: { open: "09:00 AM", close: "11:00 PM", enabled: true },
    Saturday: { open: "10:00 AM", close: "11:00 PM", enabled: true },
    Sunday: { open: "10:00 AM", close: "09:00 PM", enabled: false },
};

const initialTaxSettings: TaxSettings = {
    enabled: true,
    rate: "8.875",
    inclusive: false,
    label: "Sales Tax",
};

const initialServiceCharge: ServiceCharge = {
    enabled: true,
    autoGratuity: true,
    largePartySize: "6",
    rate: "18.00",
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

const initialPrinters: PrinterDevice[] = [
    { id: "1", name: "Front Receipt Printer", type: "receipt", connectionType: "wifi", status: "online", ipAddress: "192.168.1.101", isEnabled: true },
    { id: "2", name: "Kitchen Printer - Hot Line", type: "kitchen", connectionType: "wifi", status: "online", ipAddress: "192.168.1.102", isEnabled: true },
    { id: "3", name: "Kitchen Printer - Cold Line", type: "kitchen", connectionType: "wifi", status: "online", ipAddress: "192.168.1.103", isEnabled: true },
    { id: "4", name: "Bar Printer", type: "kitchen", connectionType: "wifi", status: "offline", ipAddress: "192.168.1.104", isEnabled: false },
    { id: "5", name: "Label Printer", type: "label", connectionType: "usb", status: "online", isEnabled: true },
];

const initialReceiptSettings: ReceiptSettings = {
    showTaxBreakdown: true,
    showItemizedList: true,
    showTips: true,
    printCustomerCopy: false,
    footerMessage: "Thank you for dining with us!",
};

const initialKitchenSettings: KitchenSettings = {
    autoFireTickets: false,
    fireDelay: 30,
    printVoidTickets: true,
    showGuestCount: true,
    showModifiers: true,
    showCourseNumber: true,
    showServerName: true,
    largeFont: false,
};

const initialPrinterRoutes: PrinterRoute[] = [
    { id: "1", category: "Main Course", printerId: "2", isEnabled: true },
    { id: "2", category: "Appetizers", printerId: "2", isEnabled: true },
    { id: "3", category: "Sides", printerId: "3", isEnabled: true },
    { id: "4", category: "Drinks", printerId: "4", isEnabled: true },
    { id: "5", category: "Desserts", printerId: "3", isEnabled: true },
];

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

const initialFunding: FundingSettings = { instant: false, balance: 2450.0 };
const initialTokenization: TokenizationSettings = { enabled: true };
const initialTextToPay: TextToPaySettings = { enabled: false, testSent: false };

const initialThrottling: ThrottlingSettings = {
    enabled: true,
    capacity: 75,
    currentLoad: 68,
    pauseOnline: true,
    increasePrepTime: true,
    alertManager: true,
};

const initialKds: KDSSettings = { enabled: true };

const initialPrepTimes: PrepTimeSettings = {
    showToCustomers: true,
    autoAdjust: true,
    currentAdjustment: 5,
};

const initialPrepCategories: PrepCategory[] = [
    { id: "1", name: "Appetizers", minutes: 8 },
    { id: "2", name: "Entrees", minutes: 15 },
    { id: "3", name: "Sides", minutes: 5 },
    { id: "4", name: "Desserts", minutes: 10 },
    { id: "5", name: "Drinks", minutes: 3 },
];

// ==================== CREATE STORE ====================

export const useSettingsPageStore = create<SettingsPageState>((set) => ({
    // Initial State
    businessInfo: initialBusinessInfo,
    operatingHours: initialOperatingHours,
    taxSettings: initialTaxSettings,
    serviceCharge: initialServiceCharge,
    permissions: initialPermissions,
    clockInSettings: initialClockInSettings,
    printers: initialPrinters,
    receiptSettings: initialReceiptSettings,
    kitchenSettings: initialKitchenSettings,
    printerRoutes: initialPrinterRoutes,
    dualPricing: initialDualPricing,
    surcharging: initialSurcharging,
    funding: initialFunding,
    tokenization: initialTokenization,
    textToPay: initialTextToPay,
    throttling: initialThrottling,
    kds: initialKds,
    prepTimes: initialPrepTimes,
    prepCategories: initialPrepCategories,

    // Actions
    setBusinessInfo: (info) => set((s) => ({ businessInfo: { ...s.businessInfo, ...info } })),
    setOperatingHours: (hours) => set({ operatingHours: hours }),
    updateDayHours: (day, data) => set((s) => ({
        operatingHours: { ...s.operatingHours, [day]: { ...s.operatingHours[day], ...data } }
    })),
    setTaxSettings: (settings) => set((s) => ({ taxSettings: { ...s.taxSettings, ...settings } })),
    setServiceCharge: (settings) => set((s) => ({ serviceCharge: { ...s.serviceCharge, ...settings } })),

    setPermissions: (permissions) => set({ permissions }),
    togglePermission: (permId, role) => set((s) => ({
        permissions: s.permissions.map(p =>
            p.id === permId ? { ...p, [role]: !p[role as keyof Permission] } : p
        )
    })),
    setClockInSettings: (settings) => set((s) => ({ clockInSettings: { ...s.clockInSettings, ...settings } })),

    setPrinters: (printers) => set({ printers }),
    addPrinter: (printer) => set((s) => ({ printers: [...s.printers, printer] })),
    updatePrinter: (id, data) => set((s) => ({
        printers: s.printers.map(p => p.id === id ? { ...p, ...data } : p)
    })),
    removePrinter: (id) => set((s) => ({ printers: s.printers.filter(p => p.id !== id) })),
    setReceiptSettings: (settings) => set((s) => ({ receiptSettings: { ...s.receiptSettings, ...settings } })),
    setKitchenSettings: (settings) => set((s) => ({ kitchenSettings: { ...s.kitchenSettings, ...settings } })),
    setPrinterRoutes: (routes) => set({ printerRoutes: routes }),
    addPrinterRoute: (route) => set((s) => ({ printerRoutes: [...s.printerRoutes, route] })),
    updatePrinterRoute: (id, data) => set((s) => ({
        printerRoutes: s.printerRoutes.map(r => r.id === id ? { ...r, ...data } : r)
    })),

    setDualPricing: (settings) => set((s) => ({ dualPricing: { ...s.dualPricing, ...settings } })),
    setSurcharging: (settings) => set((s) => ({ surcharging: { ...s.surcharging, ...settings } })),
    setFunding: (settings) => set((s) => ({ funding: { ...s.funding, ...settings } })),
    setTokenization: (settings) => set((s) => ({ tokenization: { ...s.tokenization, ...settings } })),
    setTextToPay: (settings) => set((s) => ({ textToPay: { ...s.textToPay, ...settings } })),
    setThrottling: (settings) => set((s) => ({ throttling: { ...s.throttling, ...settings } })),
    setKds: (settings) => set((s) => ({ kds: { ...s.kds, ...settings } })),
    setPrepTimes: (settings) => set((s) => ({ prepTimes: { ...s.prepTimes, ...settings } })),
    setPrepCategories: (categories) => set({ prepCategories: categories }),
    adjustPrepTime: (id, delta) => set((s) => ({
        prepCategories: s.prepCategories.map(c =>
            c.id === id ? { ...c, minutes: Math.max(1, c.minutes + delta) } : c
        )
    })),
}));
