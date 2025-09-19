// stores/useAnalyticsStore.ts

import {
    InventoryAnalysis,
    KPIs,
    SaleEvent,
    SalesTrend,
    calculateAllMetrics,
    generateMockSalesData
} from '@/lib/analyticsEngine';
import { create } from 'zustand';

export interface DateRange {
    start: Date;
    end: Date;
}

export interface Filters {
    dateRange: DateRange;
    location?: string;
    employee?: string;
    category?: string;
}

export interface CustomReportConfig {
    id: string;
    name: string;
    metrics: string[];
    breakdown: string;
    chartType: 'bar' | 'line';
    filters: Filters;
    createdAt: Date;
}

export interface ReportData {
    title: string;
    kpis: KPIs;
    inventoryAnalysis: InventoryAnalysis;
    salesTrends: SalesTrend[];
    chartData: any[];
    tableData: {
        headers: string[];
        rows: any[][];
    };
}

export interface AnalyticsState {
    // Data
    salesData: SaleEvent[];
    currentReportData: ReportData | null;
    savedCustomReports: CustomReportConfig[];

    // UI State
    isLoading: boolean;
    error: string | null;
    filters: Filters;

    // Actions
    addSaleEvent: (event: SaleEvent) => void;
    setFilters: (filters: Partial<Filters>) => void;
    setDateRange: (dateRange: DateRange) => void;
    setLocation: (location: string) => void;
    setEmployee: (employee: string) => void;
    fetchReportData: (config: { type?: string; customConfig?: CustomReportConfig }) => void;
    saveCustomReport: (config: Omit<CustomReportConfig, 'id' | 'createdAt'>) => void;
    deleteCustomReport: (id: string) => void;
    clearError: () => void;
    resetFilters: () => void;
}

// Initialize with mock data
const initialSalesData = generateMockSalesData(30);

const defaultFilters: Filters = {
    dateRange: {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        end: new Date()
    }
};

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
    // Initial state
    salesData: initialSalesData,
    currentReportData: null,
    savedCustomReports: [],
    isLoading: false,
    error: null,
    filters: defaultFilters,

    // Actions
    addSaleEvent: (event: SaleEvent) => {
        set((state) => ({
            salesData: [...state.salesData, event]
        }));

        // Recalculate current report if it exists
        const { currentReportData } = get();
        if (currentReportData) {
            get().fetchReportData({ type: 'overview' });
        }
    },

    setFilters: (newFilters: Partial<Filters>) => {
        set((state) => ({
            filters: { ...state.filters, ...newFilters }
        }));
    },

    setDateRange: (dateRange: DateRange) => {
        set((state) => ({
            filters: { ...state.filters, dateRange }
        }));
    },

    setLocation: (location: string) => {
        set((state) => ({
            filters: { ...state.filters, location }
        }));
    },

    setEmployee: (employee: string) => {
        set((state) => ({
            filters: { ...state.filters, employee }
        }));
    },

    fetchReportData: async (config: { type?: string; customConfig?: CustomReportConfig }) => {
        set({ isLoading: true, error: null });

        try {
            const { salesData, filters } = get();

            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 500));

            let reportData: ReportData;

            if (config.type) {
                // Pre-built report types
                reportData = generatePreBuiltReport(config.type, salesData, filters);
            } else if (config.customConfig) {
                // Custom report
                reportData = generateCustomReport(config.customConfig, salesData);
            } else {
                throw new Error('Invalid report configuration');
            }

            set({
                currentReportData: reportData,
                isLoading: false
            });
        } catch (error) {
            set({
                error: error instanceof Error ? error.message : 'Failed to fetch report data',
                isLoading: false
            });
        }
    },

    saveCustomReport: (config: Omit<CustomReportConfig, 'id' | 'createdAt'>) => {
        const newReport: CustomReportConfig = {
            ...config,
            id: `custom_${Date.now()}`,
            createdAt: new Date()
        };

        set((state) => ({
            savedCustomReports: [...state.savedCustomReports, newReport]
        }));
    },

    deleteCustomReport: (id: string) => {
        set((state) => ({
            savedCustomReports: state.savedCustomReports.filter(report => report.id !== id)
        }));
    },

    clearError: () => {
        set({ error: null });
    },

    resetFilters: () => {
        set({ filters: defaultFilters });
    }
}));

// Helper function to generate smart date range titles
function getSmartDateRangeTitle(baseTitle: string, salesTrends: SalesTrend[]): string {
    if (!salesTrends || salesTrends.length === 0) {
        return baseTitle;
    }

    const dates = salesTrends.map(trend => new Date(trend.date));
    const startDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const endDate = new Date(Math.max(...dates.map(d => d.getTime())));

    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();

    if (startYear === endYear) {
        return `${baseTitle} - ${startYear}`;
    } else {
        return `${baseTitle} - ${startYear} - ${endYear}`;
    }
}

// Helper functions for report generation
function generatePreBuiltReport(type: string, salesData: SaleEvent[], filters: Filters): ReportData {
    const { kpis, inventoryAnalysis, salesTrends } = calculateAllMetrics(salesData, filters.dateRange);

    switch (type) {
        case 'overview':
            return {
                title: getSmartDateRangeTitle('Analytics Overview', salesTrends),
                kpis,
                inventoryAnalysis,
                salesTrends,
                chartData: formatChartData(salesTrends, 'revenue'),
                tableData: formatTableData(salesTrends)
            };

        case 'sales-summary':
            return {
                title: getSmartDateRangeTitle('Sales Summary', salesTrends),
                kpis,
                inventoryAnalysis,
                salesTrends,
                chartData: formatChartData(salesTrends, 'revenue'),
                tableData: formatTableData(salesTrends)
            };

        case 'item-sales':
            return {
                title: getSmartDateRangeTitle('Item Sales Analysis', salesTrends),
                kpis,
                inventoryAnalysis,
                salesTrends,
                chartData: formatItemChartData(inventoryAnalysis.fastMovers),
                tableData: formatItemTableData(inventoryAnalysis.fastMovers)
            };

        case 'sales-by-hour':
            return {
                title: getSmartDateRangeTitle('Sales by Hour', salesTrends),
                kpis,
                inventoryAnalysis,
                salesTrends,
                chartData: formatHourlyChartData(salesData),
                tableData: formatHourlyTableData(salesData)
            };

        case 'sales-by-employee':
            return {
                title: getSmartDateRangeTitle('Sales by Employee', salesTrends),
                kpis,
                inventoryAnalysis,
                salesTrends,
                chartData: formatEmployeeChartData(salesData),
                tableData: formatEmployeeTableData(salesData)
            };

        case 'discounts':
            return {
                title: getSmartDateRangeTitle('Discount Analysis', salesTrends),
                kpis,
                inventoryAnalysis,
                salesTrends,
                chartData: formatChartData(salesTrends, 'revenue'),
                tableData: formatTableData(salesTrends)
            };

        case 'payments':
            return {
                title: getSmartDateRangeTitle('Payment Method Analysis', salesTrends),
                kpis,
                inventoryAnalysis,
                salesTrends,
                chartData: formatPaymentChartData(salesData),
                tableData: formatPaymentTableData(salesData)
            };

        default:
            throw new Error(`Unknown report type: ${type}`);
    }
}

function generateCustomReport(config: CustomReportConfig, salesData: SaleEvent[]): ReportData {
    const { kpis, inventoryAnalysis, salesTrends } = calculateAllMetrics(salesData, config.filters.dateRange);

    return {
        title: getSmartDateRangeTitle(config.name, salesTrends),
        kpis,
        inventoryAnalysis,
        salesTrends,
        chartData: formatCustomChartData(salesData, config),
        tableData: formatCustomTableData(salesData, config)
    };
}

// Chart data formatting functions
function formatChartData(trends: SalesTrend[], metric: keyof SalesTrend) {
    return trends.map(trend => ({
        date: new Date(trend.date).toLocaleDateString(),
        value: trend[metric]
    }));
}

function formatItemChartData(items: { itemName: string; totalSold: number; revenue: number }[]) {
    return items.map(item => ({
        name: item.itemName,
        quantity: item.totalSold,
        revenue: item.revenue
    }));
}

function formatHourlyChartData(salesData: SaleEvent[]) {
    const hourlyData = new Map<number, { orders: number; revenue: number }>();

    for (let hour = 0; hour < 24; hour++) {
        hourlyData.set(hour, { orders: 0, revenue: 0 });
    }

    salesData.forEach(sale => {
        const hour = new Date(sale.date).getHours();
        const existing = hourlyData.get(hour)!;
        hourlyData.set(hour, {
            orders: existing.orders + 1,
            revenue: existing.revenue + (sale.salePrice * sale.quantitySold)
        });
    });

    return Array.from(hourlyData.entries()).map(([hour, data]) => ({
        hour: `${hour}:00`,
        orders: data.orders,
        revenue: data.revenue
    }));
}

function formatEmployeeChartData(salesData: SaleEvent[]) {
    const employeeData = new Map<string, { orders: number; revenue: number }>();

    salesData.forEach(sale => {
        const employeeId = sale.employeeId || 'Unknown';
        const existing = employeeData.get(employeeId) || { orders: 0, revenue: 0 };
        employeeData.set(employeeId, {
            orders: existing.orders + 1,
            revenue: existing.revenue + (sale.salePrice * sale.quantitySold)
        });
    });

    return Array.from(employeeData.entries()).map(([employee, data]) => ({
        employee: `Employee ${employee.split('_')[1] || employee}`,
        orders: data.orders,
        revenue: data.revenue
    }));
}

function formatPaymentChartData(salesData: SaleEvent[]) {
    const paymentData = new Map<string, { orders: number; revenue: number }>();

    salesData.forEach(sale => {
        const method = sale.paymentMethod || 'Unknown';
        const existing = paymentData.get(method) || { orders: 0, revenue: 0 };
        paymentData.set(method, {
            orders: existing.orders + 1,
            revenue: existing.revenue + (sale.salePrice * sale.quantitySold)
        });
    });

    return Array.from(paymentData.entries()).map(([method, data]) => ({
        method: method.charAt(0).toUpperCase() + method.slice(1),
        orders: data.orders,
        revenue: data.revenue
    }));
}

function formatCustomChartData(salesData: SaleEvent[], config: CustomReportConfig) {
    // This would be more complex based on the custom configuration
    return formatChartData(calculateAllMetrics(salesData, config.filters.dateRange).salesTrends, 'revenue');
}

// Table data formatting functions
function formatTableData(trends: SalesTrend[]) {
    return {
        headers: ['Date', 'Revenue', 'Orders', 'Items Sold'],
        rows: trends.map(trend => [
            new Date(trend.date).toLocaleDateString(),
            `$${trend.revenue.toFixed(2)}`,
            trend.orders.toString(),
            trend.itemsSold.toString()
        ])
    };
}

function formatItemTableData(items: { itemName: string; totalSold: number; revenue: number }[]) {
    return {
        headers: ['Item Name', 'Quantity Sold', 'Revenue'],
        rows: items.map(item => [
            item.itemName,
            item.totalSold.toString(),
            `$${item.revenue.toFixed(2)}`
        ])
    };
}

function formatHourlyTableData(salesData: SaleEvent[]) {
    const hourlyData = formatHourlyChartData(salesData);
    return {
        headers: ['Hour', 'Orders', 'Revenue'],
        rows: hourlyData.map(data => [
            data.hour,
            data.orders.toString(),
            `$${data.revenue.toFixed(2)}`
        ])
    };
}

function formatEmployeeTableData(salesData: SaleEvent[]) {
    const employeeData = formatEmployeeChartData(salesData);
    return {
        headers: ['Employee', 'Orders', 'Revenue'],
        rows: employeeData.map(data => [
            data.employee,
            data.orders.toString(),
            `$${data.revenue.toFixed(2)}`
        ])
    };
}

function formatPaymentTableData(salesData: SaleEvent[]) {
    const paymentData = formatPaymentChartData(salesData);
    return {
        headers: ['Payment Method', 'Orders', 'Revenue'],
        rows: paymentData.map(data => [
            data.method,
            data.orders.toString(),
            `$${data.revenue.toFixed(2)}`
        ])
    };
}

function formatCustomTableData(salesData: SaleEvent[], config: CustomReportConfig) {
    // This would be more complex based on the custom configuration
    return formatTableData(calculateAllMetrics(salesData, config.filters.dateRange).salesTrends);
}

// Initialize the store with default data
useAnalyticsStore.getState().fetchReportData({ type: 'overview' });