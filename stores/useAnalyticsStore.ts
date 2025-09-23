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
    chartType: 'bar' | 'line' | 'pie';
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
    addSaleEvent: (event: SaleEvent[]) => void;
    setFilters: (filters: Partial<Filters>) => void;
    setDateRange: (dateRange: DateRange) => void;
    setLocation: (location: string) => void;
    setEmployee: (employee: string) => void;
    fetchReportData: (config: { type?: string; customConfig?: CustomReportConfig }) => void;
    saveCustomReport: (config: Omit<CustomReportConfig, 'id' | 'createdAt'>) => void;
    deleteCustomReport: (id: string) => void;
    clearError: () => void;
    resetFilters: () => void;
    forceRefresh: () => void;
}

// Initialize with mock data
const initialSalesData = generateMockSalesData(30);

const defaultFilters: Filters = {
    dateRange: {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        end: new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow to ensure today is included
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
    addSaleEvent: (event: SaleEvent[]) => {
        console.log('📈 Analytics Store: Adding sale events:', event);

        set((state) => {
            const newSalesData = [...state.salesData, ...event];
            console.log('📈 Analytics Store: Total sales data count:', newSalesData.length);
            // Ensure current filters include "now" so new sales reflect immediately
            const now = new Date();
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            const currentRange = state.filters?.dateRange;
            let updatedFilters = state.filters;
            if (currentRange) {
                // If end is before now, extend to tomorrow
                if (currentRange.end < now) {
                    updatedFilters = {
                        ...state.filters,
                        dateRange: {
                            start: currentRange.start,
                            end: tomorrow
                        }
                    };
                }
            } else {
                updatedFilters = {
                    ...state.filters,
                    dateRange: { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: tomorrow }
                };
            }

            return {
                salesData: newSalesData,
                filters: updatedFilters
            };
        });

        // Recalculate current report if it exists
        const { currentReportData } = get();
        if (currentReportData) {
            console.log('📈 Analytics Store: Refreshing report data...');
            // Use setTimeout to avoid blocking the UI during payment processing
            setTimeout(() => {
                get().fetchReportData({ type: 'overview' });
            }, 100);
        } else {
            console.log('📈 Analytics Store: No current report data, initializing...');
            // Initialize the report data if it doesn't exist
            setTimeout(() => {
                get().fetchReportData({ type: 'overview' });
            }, 100);
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
                console.log('📊 Analytics Store: Generating custom report with config:', config.customConfig);
                reportData = generateCustomReport(config.customConfig, salesData);
                console.log('📊 Analytics Store: Generated custom report data:', {
                    title: reportData.title,
                    chartDataLength: reportData.chartData?.length,
                    firstChartItem: reportData.chartData?.[0]
                });
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
    },

    // Force refresh analytics data (useful for debugging)
    forceRefresh: () => {
        console.log('🔄 Analytics Store: Force refreshing...');
        get().fetchReportData({ type: 'overview' });
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
    // Ensure dateRange is valid before passing to calculateAllMetrics
    const dateRange = config.filters.dateRange?.start && config.filters.dateRange?.end
        ? config.filters.dateRange
        : undefined;

    const { kpis, inventoryAnalysis, salesTrends } = calculateAllMetrics(salesData, dateRange);

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
    console.log('📊 Custom Report: Generating chart data for', config.name);
    console.log('📊 Custom Report: Metrics:', config.metrics);
    console.log('📊 Custom Report: Breakdown:', config.breakdown);

    // Filter data by date range
    const filteredData = salesData.filter(s => {
        const saleDate = new Date(s.date);
        const startDate = config.filters.dateRange?.start;
        const endDate = config.filters.dateRange?.end;

        if (!startDate || !endDate) {
            console.log('📊 Custom Report: No valid date range, including all data');
            return true;
        }

        return saleDate >= startDate && saleDate <= endDate;
    });

    // Group data by breakdown dimension
    const groupedData = new Map<string, any>();

    filteredData.forEach(sale => {
        let groupKey: string;

        switch (config.breakdown) {
            case 'item':
                groupKey = sale.itemName;
                break;
            case 'category':
                groupKey = sale.category || 'Uncategorized';
                break;
            case 'employee':
                groupKey = sale.employeeId || 'Unknown';
                break;
            case 'payment_method':
                groupKey = sale.paymentMethod || 'Unknown';
                break;
            case 'hour':
                groupKey = new Date(sale.date).getHours().toString();
                break;
            case 'day':
                groupKey = new Date(sale.date).toLocaleDateString('en-US', { weekday: 'long' });
                break;
            case 'date':
                groupKey = new Date(sale.date).toLocaleDateString();
                break;
            default:
                groupKey = 'All';
        }

        if (!groupedData.has(groupKey)) {
            groupedData.set(groupKey, {
                name: groupKey,
                revenue: 0,
                costOfGoods: 0,
                grossMargin: 0,
                orderCount: new Set(),
                itemQuantity: 0,
                averageOrderValue: 0
            });
        }

        const group = groupedData.get(groupKey);
        group.revenue += sale.salePrice * sale.quantitySold;
        group.costOfGoods += sale.costOfGoods * sale.quantitySold;
        group.itemQuantity += sale.quantitySold;
        if (sale.orderId) {
            group.orderCount.add(sale.orderId);
        }
    });

    // Calculate derived metrics
    groupedData.forEach(group => {
        group.grossMargin = group.revenue - group.costOfGoods;
        group.averageOrderValue = group.orderCount.size > 0 ? group.revenue / group.orderCount.size : 0;
    });

    // Convert to array and sort by primary metric
    const primaryMetric = config.metrics[0] || 'revenue';
    const sortedData = Array.from(groupedData.values()).sort((a, b) => {
        return (b[primaryMetric] || 0) - (a[primaryMetric] || 0);
    });

    console.log('📊 Custom Report: Generated data:', sortedData.slice(0, 5));
    console.log('📊 Custom Report: Sample data structure:', {
        firstItem: sortedData[0],
        hasName: sortedData[0]?.name,
        hasDate: sortedData[0]?.date,
        breakdown: config.breakdown
    });

    return sortedData;
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
    console.log('📊 Custom Report: Generating table data for', config.name);

    // Use the same logic as formatCustomChartData
    const chartData = formatCustomChartData(salesData, config);

    // Generate headers based on selected metrics and breakdown
    const headers = [config.breakdown.charAt(0).toUpperCase() + config.breakdown.slice(1)];
    config.metrics.forEach(metric => {
        switch (metric) {
            case 'revenue':
                headers.push('Revenue');
                break;
            case 'cost_of_goods':
                headers.push('Cost of Goods');
                break;
            case 'gross_margin':
                headers.push('Gross Margin');
                break;
            case 'order_count':
                headers.push('Orders');
                break;
            case 'item_quantity':
                headers.push('Items Sold');
                break;
            case 'average_order_value':
                headers.push('Avg Order Value');
                break;
        }
    });

    // Generate rows
    const rows = chartData.map(item => {
        const row = [item.name];
        config.metrics.forEach(metric => {
            switch (metric) {
                case 'revenue':
                    row.push(`$${item.revenue.toFixed(2)}`);
                    break;
                case 'cost_of_goods':
                    row.push(`$${item.costOfGoods.toFixed(2)}`);
                    break;
                case 'gross_margin':
                    row.push(`$${item.grossMargin.toFixed(2)}`);
                    break;
                case 'order_count':
                    row.push(item.orderCount.size.toString());
                    break;
                case 'item_quantity':
                    row.push(item.itemQuantity.toString());
                    break;
                case 'average_order_value':
                    row.push(`$${item.averageOrderValue.toFixed(2)}`);
                    break;
            }
        });
        return row;
    });

    console.log('📊 Custom Report: Generated table:', { headers, rows: rows.slice(0, 3) });

    return { headers, rows };
}

// Initialize the store with default data
useAnalyticsStore.getState().fetchReportData({ type: 'overview' });