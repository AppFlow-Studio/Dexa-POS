// Chart data transformation utilities

export interface ChartDataPoint {
    x: string | number;
    y: number;
    originalData?: any;
    index?: number;
}

export interface VictoryNativeDataPoint {
    date: string;
    revenue: number;
    originalData?: any;
    index?: number;
}

/**
 * Converts any data array to Victory Native format
 * Handles various data structures commonly used in analytics
 */
export const transformToVictoryFormat = (data: any[]): ChartDataPoint[] => {
    if (!data || !Array.isArray(data)) {
        return [];
    }

    return data.map((item: any, index: number) => {
        // Extract x value (label/date/name)
        let xValue: string | number;
        if (item.date) {
            xValue = item.date.replace('/2025', '') || `Point ${index + 1}`;
        } else if (item.name) {
            xValue = item.name;
        } else if (item.hour !== undefined) {
            xValue = item.hour;
        } else if (item.employee) {
            xValue = item.employee;
        } else if (item.method) {
            xValue = item.method;
        } else if (item.category) {
            xValue = item.category;
        } else {
            xValue = index; // Fallback to index
        }

        // Extract y value (value/revenue/quantity/orders)
        let yValue: number;
        if (typeof item.value === 'number') {
            yValue = item.value;
        } else if (typeof item.revenue === 'number') {
            yValue = item.revenue;
        } else if (typeof item.quantity === 'number') {
            yValue = item.quantity;
        } else if (typeof item.orders === 'number') {
            yValue = item.orders;
        } else if (typeof item.count === 'number') {
            yValue = item.count;
        } else {
            yValue = 0; // Fallback to 0
        }

        return {
            x: xValue,
            y: yValue,
            originalData: item,
            index
        };
    });
};

/**
 * Converts data to Victory Native sales chart format
 * Specifically for revenue/date charts
 */
export const transformToVictorySalesFormat = (data: any[]): VictoryNativeDataPoint[] => {
    if (!data || !Array.isArray(data)) {
        return [];
    }

    return data.map((item: any, index: number) => {
        // Extract date/label for x-axis
        let date: string;
        if (item.date) {
            date = item.date.replace('/2025', '') || `Point ${index + 1}`;
        } else if (item.name) {
            date = item.name;
        } else if (item.hour !== undefined) {
            date = `${item.hour}:00`;
        } else if (item.employee) {
            date = item.employee;
        } else if (item.method) {
            date = item.method;
        } else {
            date = `Point ${index + 1}`;
        }

        // Extract revenue/value for y-axis
        let revenue: number;
        if (typeof item.value === 'number') {
            revenue = item.value;
        } else if (typeof item.revenue === 'number') {
            revenue = item.revenue;
        } else if (typeof item.quantity === 'number') {
            revenue = item.quantity;
        } else if (typeof item.orders === 'number') {
            revenue = item.orders;
        } else {
            revenue = 0;
        }

        return {
            date,
            revenue,
            originalData: item,
            index
        };
    });
};

/**
 * Formats a number for display in tooltips
 */
export const formatCurrency = (value: number): string => {
    return `$${value.toLocaleString()}`;
};

/**
 * Formats a date for display in tooltips
 */
export const formatDate = (date: string): string => {
    if (!date) return 'N/A';
    return date.replace('/2025', '') || 'N/A';
};

/**
 * Gets the appropriate label for a data point
 */
export const getDataPointLabel = (item: any, index: number): string => {
    if (item.date) {
        return item.date.replace('/2025', '') || `Point ${index + 1}`;
    } else if (item.name) {
        return item.name;
    } else if (item.hour !== undefined) {
        return `${item.hour}:00`;
    } else if (item.employee) {
        return item.employee;
    } else if (item.method) {
        return item.method;
    } else if (item.category) {
        return item.category;
    } else {
        return `Point ${index + 1}`;
    }
};

/**
 * Gets the appropriate value for a data point
 */
export const getDataPointValue = (item: any): number => {
    if (typeof item.value === 'number') {
        return item.value;
    } else if (typeof item.revenue === 'number') {
        return item.revenue;
    } else if (typeof item.quantity === 'number') {
        return item.quantity;
    } else if (typeof item.orders === 'number') {
        return item.orders;
    } else if (typeof item.count === 'number') {
        return item.count;
    } else {
        return 0;
    }
};

/**
 * Gets the category for a menu item by its ID
 * @param menuItemId - The ID of the menu item
 * @param menuItems - Array of menu items to search through
 * @returns The first category name or "N/A" if not found
 */
export const getMenuItemCategory = (menuItemId: string, menuItems: any[]): string => {
    const menuItem = menuItems.find((item) => item.id === menuItemId);
    if (menuItem && menuItem.category && menuItem.category.length > 0) {
        // Return the first category (or you could join all categories with ', ')
        return menuItem.category[0];
    }
    return "N/A";
};

/**
 * Gets all categories for a menu item by its ID
 * @param menuItemId - The ID of the menu item
 * @param menuItems - Array of menu items to search through
 * @returns Array of category names or empty array if not found
 */
export const getMenuItemCategories = (menuItemId: string, menuItems: any[]): string[] => {
    const menuItem = menuItems.find((item) => item.id === menuItemId);
    if (menuItem && menuItem.category && Array.isArray(menuItem.category)) {
        return menuItem.category;
    }
    return [];
};

/**
 * Calculates the cost of goods for a menu item
 * @param menuItemId - The ID of the menu item
 * @param menuItems - Array of menu items to search through
 * @param fallbackPercentage - Percentage of sale price to use as fallback (default: 30%)
 * @returns The calculated cost of goods
 */
export const getMenuItemCostOfGoods = (
    menuItemId: string,
    menuItems: any[],
    fallbackPercentage: number = 0.3
): number => {
    const menuItem = menuItems.find((item) => item.id === menuItemId);

    if (!menuItem) {
        return 0;
    }

    // If the menu item has a recipe, calculate cost from ingredients
    if (menuItem.recipe && Array.isArray(menuItem.recipe)) {
        const recipeCost = menuItem.recipe.reduce((total: number, recipeItem: any) => {
            const ingredientCost = recipeItem.ingredient?.costPerUnit || 0;
            return total + (recipeItem.quantity * ingredientCost);
        }, 0);

        if (recipeCost > 0) {
            return recipeCost;
        }
    }

    // If the menu item has a direct cost field
    if (typeof menuItem.cost === 'number' && menuItem.cost > 0) {
        return menuItem.cost;
    }

    // Fallback: use a percentage of the sale price
    if (typeof menuItem.price === 'number' && menuItem.price > 0) {
        return menuItem.price * fallbackPercentage;
    }

    return 0;
};
