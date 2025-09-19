import { create } from "zustand";

export interface DateRange {
    from: string;
    to: string;
}

export interface AnalyticsFilters {
    dateRange: DateRange;
    locationId: string | 'all';
    employeeId: string | 'all';
}

export interface KpiData {
    label: string;
    value: string;
    definition: string;
}

export interface ChartData {
    label: string;
    value: number;
    color?: string;
}

export interface TableData {
    headers: string[];
    rows: (string | number)[][];
}

export interface ReportData {
    title: string;
    kpis: KpiData[];
    chartData: ChartData[];
    tableData: TableData;
}

export interface CustomReportConfig {
    id?: string;
    name: string;
    metrics: string[];
    breakdown: string;
    chartType: 'bar' | 'line';
}

export interface AnalyticsState {
    filters: AnalyticsFilters;
    currentReportData: ReportData | null;
    isLoading: boolean;
    error: string | null;
    savedCustomReports: CustomReportConfig[];
}

export interface AnalyticsActions {
    setFilters: (newFilters: Partial<AnalyticsFilters>) => void;
    setDateRange: (dateRange: DateRange) => void;
    setLocation: (locationId: string | 'all') => void;
    setEmployee: (employeeId: string | 'all') => void;
    fetchReportData: (reportConfig: { type?: string; customConfig?: CustomReportConfig }) => Promise<void>;
    saveCustomReport: (config: CustomReportConfig) => void;
    deleteCustomReport: (id: string) => void;
    clearError: () => void;
    resetFilters: () => void;
}

const defaultFilters: AnalyticsFilters = {
    dateRange: {
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days ago
        to: new Date().toISOString().split('T')[0], // today
    },
    locationId: 'all',
    employeeId: 'all',
};

export const useAnalyticsStore = create<AnalyticsState & AnalyticsActions>((set, get) => ({
    // Initial state
    filters: defaultFilters,
    currentReportData: null,
    isLoading: false,
    error: null,
    savedCustomReports: [],

    // Actions
    setFilters: (newFilters) => {
        set((state) => ({
            filters: { ...state.filters, ...newFilters },
        }));
    },

    setDateRange: (dateRange) => {
        set((state) => ({
            filters: { ...state.filters, dateRange },
        }));
    },

    setLocation: (locationId) => {
        set((state) => ({
            filters: { ...state.filters, locationId },
        }));
    },

    setEmployee: (employeeId) => {
        set((state) => ({
            filters: { ...state.filters, employeeId },
        }));
    },

    fetchReportData: async (reportConfig) => {
        set({ isLoading: true, error: null });

        try {
            const { filters } = get();

            // Construct API request parameters
            const params = new URLSearchParams({
                from: filters.dateRange.from,
                to: filters.dateRange.to,
                location_id: filters.locationId,
                employee_id: filters.employeeId,
            });

            let endpoint = '/api/analytics/report';

            if (reportConfig.type) {
                // Pre-built report
                params.append('type', reportConfig.type);
                endpoint += `?${params.toString()}`;
            } else if (reportConfig.customConfig) {
                // Custom report
                params.append('metrics', reportConfig.customConfig.metrics.join(','));
                params.append('breakdown', reportConfig.customConfig.breakdown);
                params.append('chart_type', reportConfig.customConfig.chartType);
                endpoint += `?${params.toString()}`;
            }

            // Mock API call - replace with actual API call
            const mockData = await mockApiCall(endpoint, reportConfig);

            set({
                currentReportData: mockData,
                isLoading: false,
                error: null,
            });
        } catch (error) {
            set({
                isLoading: false,
                error: error instanceof Error ? error.message : 'Failed to fetch report data',
                currentReportData: null,
            });
        }
    },

    saveCustomReport: (config) => {
        const newConfig = {
            ...config,
            id: config.id || `custom_${Date.now()}`,
        };

        set((state) => ({
            savedCustomReports: [...state.savedCustomReports.filter(r => r.id !== newConfig.id), newConfig],
        }));
    },

    deleteCustomReport: (id) => {
        set((state) => ({
            savedCustomReports: state.savedCustomReports.filter(r => r.id !== id),
        }));
    },

    clearError: () => {
        set({ error: null });
    },

    resetFilters: () => {
        set({ filters: defaultFilters });
    },
}));

// Mock API function - replace with actual API implementation
async function mockApiCall(endpoint: string, reportConfig: any): Promise<ReportData> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const reportType = reportConfig.type || 'custom';

    // Mock data based on report type
    switch (reportType) {
        case 'sales_summary':
            return {
                title: 'Sales Summary',
                kpis: [
                    { label: 'Total Sales', value: '$12,450.00', definition: 'Sum of all completed transactions' },
                    { label: 'Average Order', value: '$45.20', definition: 'Total sales divided by number of orders' },
                    { label: 'Orders Count', value: '275', definition: 'Total number of completed orders' },
                ],
                chartData: [
                    { label: 'Mon', value: 1200, color: '#3b82f6' },
                    { label: 'Tue', value: 1900, color: '#3b82f6' },
                    { label: 'Wed', value: 3000, color: '#3b82f6' },
                    { label: 'Thu', value: 2800, color: '#3b82f6' },
                    { label: 'Fri', value: 1890, color: '#3b82f6' },
                    { label: 'Sat', value: 2390, color: '#3b82f6' },
                    { label: 'Sun', value: 1270, color: '#3b82f6' },
                ],
                tableData: {
                    headers: ['Date', 'Sales', 'Orders', 'Avg Order'],
                    rows: [
                        ['2024-01-15', '$1,200.00', 28, '$42.86'],
                        ['2024-01-16', '$1,900.00', 42, '$45.24'],
                        ['2024-01-17', '$3,000.00', 65, '$46.15'],
                        ['2024-01-18', '$2,800.00', 58, '$48.28'],
                        ['2024-01-19', '$1,890.00', 41, '$46.10'],
                        ['2024-01-20', '$2,390.00', 52, '$45.96'],
                        ['2024-01-21', '$1,270.00', 29, '$43.79'],
                    ],
                },
            };

        case 'item_sales':
            return {
                title: 'Item Sales',
                kpis: [
                    { label: 'Top Item', value: 'Classic Burger', definition: 'Item with highest sales volume' },
                    { label: 'Total Items Sold', value: '1,247', definition: 'Sum of all item quantities sold' },
                    { label: 'Avg Items per Order', value: '4.5', definition: 'Total items divided by number of orders' },
                ],
                chartData: [
                    { label: 'Classic Burger', value: 145, color: '#22c55e' },
                    { label: 'Chicken Caesar', value: 98, color: '#3b82f6' },
                    { label: 'Margherita Pizza', value: 87, color: '#f59e0b' },
                    { label: 'French Fries', value: 156, color: '#ef4444' },
                    { label: 'Coca Cola', value: 203, color: '#8b5cf6' },
                ],
                tableData: {
                    headers: ['Item', 'Quantity Sold', 'Revenue', 'Avg Price'],
                    rows: [
                        ['Classic Burger', 145, '$1,450.00', '$10.00'],
                        ['Chicken Caesar', 98, '$1,176.00', '$12.00'],
                        ['Margherita Pizza', 87, '$1,305.00', '$15.00'],
                        ['French Fries', 156, '$468.00', '$3.00'],
                        ['Coca Cola', 203, '$406.00', '$2.00'],
                    ],
                },
            };

        case 'sales_by_hour':
            return {
                title: 'Sales by Hour',
                kpis: [
                    { label: 'Peak Hour', value: '12:00 PM', definition: 'Hour with highest sales volume' },
                    { label: 'Peak Sales', value: '$1,250.00', definition: 'Sales amount during peak hour' },
                    { label: 'Total Hours Active', value: '14', definition: 'Hours with recorded sales' },
                ],
                chartData: [
                    { label: '8 AM', value: 200, color: '#3b82f6' },
                    { label: '9 AM', value: 350, color: '#3b82f6' },
                    { label: '10 AM', value: 450, color: '#3b82f6' },
                    { label: '11 AM', value: 650, color: '#3b82f6' },
                    { label: '12 PM', value: 1250, color: '#22c55e' },
                    { label: '1 PM', value: 1100, color: '#3b82f6' },
                    { label: '2 PM', value: 800, color: '#3b82f6' },
                    { label: '3 PM', value: 600, color: '#3b82f6' },
                    { label: '4 PM', value: 400, color: '#3b82f6' },
                    { label: '5 PM', value: 700, color: '#3b82f6' },
                    { label: '6 PM', value: 950, color: '#3b82f6' },
                    { label: '7 PM', value: 850, color: '#3b82f6' },
                ],
                tableData: {
                    headers: ['Hour', 'Sales', 'Orders', 'Avg Order'],
                    rows: [
                        ['8:00 AM', '$200.00', 5, '$40.00'],
                        ['9:00 AM', '$350.00', 8, '$43.75'],
                        ['10:00 AM', '$450.00', 10, '$45.00'],
                        ['11:00 AM', '$650.00', 14, '$46.43'],
                        ['12:00 PM', '$1,250.00', 28, '$44.64'],
                        ['1:00 PM', '$1,100.00', 24, '$45.83'],
                        ['2:00 PM', '$800.00', 18, '$44.44'],
                        ['3:00 PM', '$600.00', 13, '$46.15'],
                        ['4:00 PM', '$400.00', 9, '$44.44'],
                        ['5:00 PM', '$700.00', 15, '$46.67'],
                        ['6:00 PM', '$950.00', 21, '$45.24'],
                        ['7:00 PM', '$850.00', 19, '$44.74'],
                    ],
                },
            };

        default:
            return {
                title: 'Custom Report',
                kpis: [
                    { label: 'Total Value', value: '$8,500.00', definition: 'Sum of selected metrics' },
                    { label: 'Record Count', value: '125', definition: 'Number of records in dataset' },
                    { label: 'Average', value: '$68.00', definition: 'Average value per record' },
                ],
                chartData: [
                    { label: 'Category A', value: 2500, color: '#3b82f6' },
                    { label: 'Category B', value: 1800, color: '#22c55e' },
                    { label: 'Category C', value: 2200, color: '#f59e0b' },
                    { label: 'Category D', value: 2000, color: '#ef4444' },
                ],
                tableData: {
                    headers: ['Category', 'Value', 'Count', 'Percentage'],
                    rows: [
                        ['Category A', '$2,500.00', 35, '29.4%'],
                        ['Category B', '$1,800.00', 25, '20.0%'],
                        ['Category C', '$2,200.00', 30, '24.0%'],
                        ['Category D', '$2,000.00', 35, '26.6%'],
                    ],
                },
            };
    }
}
