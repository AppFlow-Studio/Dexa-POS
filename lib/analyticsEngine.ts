// lib/analyticsEngine.ts

export interface SaleEvent {
  date: string; // ISO string
  menuItemId: string;
  itemName: string;
  quantitySold: number;
  salePrice: number; // Price per item
  costOfGoods: number; // Cost per item
  category: string;
  employeeId?: string;
  paymentMethod?: string;
  orderId?: string; // Optional order ID for better tracking
}

export interface KPIs {
  grossMargin: number;
  netMargin: number;
  inventoryTurnover: number;
  averageOrderValue: number;
  totalRevenue: number;
  totalCOGS: number;
  totalOrders: number;
  totalItemsSold: number;
}

export interface InventoryAnalysis {
  fastMovers: { itemName: string; totalSold: number; revenue: number }[];
  slowMovers: { itemName: string; totalSold: number; revenue: number }[];
  topCategories: { category: string; totalSold: number; revenue: number }[];
  lowStockItems: {
    itemName: string;
    currentStock: number;
    reorderThreshold: number;
  }[];
  menuQuadrants: MenuQuadrants;
}

export interface MenuQuadrants {
  stars: { itemName: string; totalSold: number; profit: number }[]; // High Pop, High Profit
  plowhorses: { itemName: string; totalSold: number; profit: number }[]; // High Pop, Low Profit
  puzzles: { itemName: string; totalSold: number; profit: number }[]; // Low Pop, High Profit
  dogs: { itemName: string; totalSold: number; profit: number }[]; // Low Pop, Low Profit
}
export interface SalesTrend {
  date: string;
  revenue: number;
  orders: number;
  itemsSold: number;
}

// Gross Margin = ((Total Revenue - COGS) / Total Revenue) * 100
export function calculateGrossMargin(sales: SaleEvent[]): number {
  const totalRevenue = sales.reduce(
    (sum, s) => sum + s.salePrice * s.quantitySold,
    0
  );
  const totalCOGS = sales.reduce(
    (sum, s) => sum + s.costOfGoods * s.quantitySold,
    0
  );
  if (totalRevenue === 0) return 0;
  return ((totalRevenue - totalCOGS) / totalRevenue) * 100;
}

// Net Margin = ((Total Revenue - COGS - Operating Expenses) / Total Revenue) * 100
// For now, we'll use a simplified version without operating expenses
export function calculateNetMargin(sales: SaleEvent[]): number {
  return calculateGrossMargin(sales); // Simplified for now
}

// Average Order Value = Total Revenue / Number of Orders
export function calculateAverageOrderValue(sales: SaleEvent[]): number {
  const totalRevenue = sales.reduce(
    (sum, s) => sum + s.salePrice * s.quantitySold,
    0
  );

  // Use orderId if available, otherwise fall back to date-based grouping
  const uniqueOrders = sales.some((s) => s.orderId)
    ? new Set(sales.map((s) => s.orderId).filter(Boolean)).size
    : new Set(sales.map((s) => s.date.split("T")[0])).size;

  return uniqueOrders > 0 ? totalRevenue / uniqueOrders : 0;
}

// Inventory Turnover Rate = COGS / Average Inventory Value
// For now, we'll use a placeholder calculation
export function calculateInventoryTurnover(sales: SaleEvent[]): number {
  const totalCOGS = sales.reduce(
    (sum, s) => sum + s.costOfGoods * s.quantitySold,
    0
  );
  // Placeholder: assume average inventory is 20% of COGS
  const averageInventory = totalCOGS * 0.2;
  return averageInventory > 0 ? totalCOGS / averageInventory : 0;
}

// Fast/Slow Movers Analysis
export function analyzeMovers(sales: SaleEvent[]): {
  fastMovers: { itemName: string; totalSold: number; revenue: number }[];
  slowMovers: { itemName: string; totalSold: number; revenue: number }[];
} {
  // console.log('🏃 Fast Movers Analysis: Processing', sales.length, 'sales events');

  const itemSales = new Map<string, { totalSold: number; revenue: number }>();
  sales.forEach((s) => {
    const existing = itemSales.get(s.itemName) || { totalSold: 0, revenue: 0 };
    itemSales.set(s.itemName, {
      totalSold: existing.totalSold + s.quantitySold,
      revenue: existing.revenue + s.salePrice * s.quantitySold,
    });
  });

  const sortedItems = [...itemSales.entries()]
    .map(([name, data]) => ({ itemName: name, ...data }))
    .sort((a, b) => b.totalSold - a.totalSold);

  const fastMovers = sortedItems.slice(0, 5);
  const slowMovers = sortedItems.slice(-5).reverse();

  // console.log('🏃 Fast Movers Analysis: Top items:', fastMovers);

  return { fastMovers, slowMovers };
}

// Category Analysis
export function analyzeCategories(sales: SaleEvent[]): {
  topCategories: { category: string; totalSold: number; revenue: number }[];
} {
  const categorySales = new Map<
    string,
    { totalSold: number; revenue: number }
  >();

  sales.forEach((s) => {
    const category = s.category || "Uncategorized";
    const existing = categorySales.get(category) || {
      totalSold: 0,
      revenue: 0,
    };
    categorySales.set(category, {
      totalSold: existing.totalSold + s.quantitySold,
      revenue: existing.revenue + s.salePrice * s.quantitySold,
    });
  });

  return {
    topCategories: [...categorySales.entries()]
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
  };
}

// Sales Trend Analysis (daily aggregation)
export function calculateSalesTrends(
  sales: SaleEvent[],
  days: number = 30
): SalesTrend[] {
  const trends = new Map<
    string,
    { revenue: number; orders: number; itemsSold: number }
  >();

  // Initialize last N days
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split("T")[0];
    trends.set(dateKey, { revenue: 0, orders: 0, itemsSold: 0 });
  }

  // Aggregate sales data
  sales.forEach((s) => {
    const dateKey = s.date.split("T")[0];
    const existing = trends.get(dateKey);
    if (existing) {
      existing.revenue += s.salePrice * s.quantitySold;
      existing.orders += 1;
      existing.itemsSold += s.quantitySold;
    }
  });

  return [...trends.entries()]
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Main calculation function
export function calculateAllMetrics(
  sales: SaleEvent[],
  dateRange?: { start: Date; end: Date }
): {
  kpis: KPIs;
  inventoryAnalysis: InventoryAnalysis;
  salesTrends: SalesTrend[];
} {
  //console.log('🧮 Analytics Engine: Calculating metrics for', sales.length, 'sales events');

  // Filter data by date range if provided
  const filteredData = dateRange
    ? sales.filter((s) => {
        const saleDate = new Date(s.date);
        const isInRange =
          saleDate >= dateRange.start && saleDate <= dateRange.end;
        if (!isInRange) {
          // console.log('🧮 Analytics Engine: Filtering out sale:', {
          //     item: s.itemName,
          //     date: s.date,
          //     saleDate: saleDate.toISOString(),
          //     start: dateRange?.start?.toISOString() || 'No start date',
          //     end: dateRange?.end?.toISOString() || 'No end date'
          // });
        }
        return isInRange;
      })
    : sales;

  // console.log('🧮 Analytics Engine: Filtered data count:', filteredData.length);
  // console.log('🧮 Analytics Engine: Date range:', dateRange ? {
  //     start: dateRange.start?.toISOString() || 'No start date',
  //     end: dateRange.end?.toISOString() || 'No end date'
  // } : 'No date range');

  const totalRevenue = filteredData.reduce(
    (sum, s) => sum + s.salePrice * s.quantitySold,
    0
  );
  const totalCOGS = filteredData.reduce(
    (sum, s) => sum + s.costOfGoods * s.quantitySold,
    0
  );

  // Use orderId if available for more accurate order counting
  const totalOrders = filteredData.some((s) => s.orderId)
    ? new Set(filteredData.map((s) => s.orderId).filter(Boolean)).size
    : new Set(filteredData.map((s) => s.date.split("T")[0])).size;

  const totalItemsSold = filteredData.reduce(
    (sum, s) => sum + s.quantitySold,
    0
  );

  // console.log('🧮 Analytics Engine: Calculated totals:', {
  //     totalRevenue,
  //     totalCOGS,
  //     totalOrders,
  //     totalItemsSold
  // });

  const kpis: KPIs = {
    grossMargin: calculateGrossMargin(filteredData),
    netMargin: calculateNetMargin(filteredData),
    inventoryTurnover: calculateInventoryTurnover(filteredData),
    averageOrderValue: calculateAverageOrderValue(filteredData),
    totalRevenue,
    totalCOGS,
    totalOrders,
    totalItemsSold,
  };

  const { fastMovers, slowMovers } = analyzeMovers(filteredData);
  const { topCategories } = analyzeCategories(filteredData);
  const menuQuadrants = calculateMenuEngineering(filteredData);

  const inventoryAnalysis: InventoryAnalysis = {
    fastMovers,
    slowMovers,
    topCategories,
    lowStockItems: [], // Will be populated from inventory store
    menuQuadrants,
  };

  const salesTrends = calculateSalesTrends(filteredData);

  return {
    kpis,
    inventoryAnalysis,
    salesTrends,
  };
}

// Menu Engineering Analysis (Stars, Plowhorses, Puzzles, Dogs)
export function calculateMenuEngineering(sales: SaleEvent[]): MenuQuadrants {
  // 1. Aggregate data per item
  const itemData = new Map<
    string,
    { totalSold: number; totalProfit: number }
  >();
  let grandTotalSold = 0;

  // Calculate totals per item
  sales.forEach((s) => {
    const profit = (s.salePrice - s.costOfGoods) * s.quantitySold;
    const existing = itemData.get(s.itemName) || {
      totalSold: 0,
      totalProfit: 0,
    };

    itemData.set(s.itemName, {
      totalSold: existing.totalSold + s.quantitySold,
      totalProfit: existing.totalProfit + profit,
    });

    grandTotalSold += s.quantitySold;
  });

  // 2. Calculate Averages (Baselines)
  const uniqueItemCount = itemData.size;
  if (uniqueItemCount === 0) {
    return { stars: [], plowhorses: [], puzzles: [], dogs: [] };
  }

  const avgPopularity = grandTotalSold / uniqueItemCount;
  // For avg profitability, we can use avg profit per item *quantity* OR avg total profit per item type.
  // Standard Menu Engineering usually uses "Average Contribution Margin" (weighted average).
  // Let's use average total profit per item type as the dividing line for simplicity in this dataset,
  // or better: total profit of all items / total quantity sold (Weighted Avg Margin)??
  // Actually, usually it compares "Item Mix %" (Popularity) vs "Contribution Margin" (Profitability).
  // Let's stick to: Does this item generate more TOTAL profit than the average item?

  const totalProfitAllItems = Array.from(itemData.values()).reduce(
    (sum, i) => sum + i.totalProfit,
    0
  );
  const avgTotalProfit = totalProfitAllItems / uniqueItemCount;

  // 3. Classify
  const stars: { itemName: string; totalSold: number; profit: number }[] = [];
  const plowhorses: { itemName: string; totalSold: number; profit: number }[] =
    [];
  const puzzles: { itemName: string; totalSold: number; profit: number }[] = [];
  const dogs: { itemName: string; totalSold: number; profit: number }[] = [];

  itemData.forEach((data, itemName) => {
    const isHighPopularity = data.totalSold >= avgPopularity;
    const isHighProfit = data.totalProfit >= avgTotalProfit;

    const entry = {
      itemName,
      totalSold: data.totalSold,
      profit: data.totalProfit,
    };

    if (isHighPopularity && isHighProfit) stars.push(entry);
    else if (isHighPopularity && !isHighProfit) plowhorses.push(entry);
    else if (!isHighPopularity && isHighProfit) puzzles.push(entry);
    else dogs.push(entry);
  });

  // Sort by profit or volume for better display
  stars.sort((a, b) => b.profit - a.profit);
  plowhorses.sort((a, b) => b.totalSold - a.totalSold);
  puzzles.sort((a, b) => b.profit - a.profit);
  dogs.sort((a, b) => b.profit - a.profit);

  return { stars, plowhorses, puzzles, dogs };
}

// Generate mock data for testing
export function generateMockSalesData(days: number = 30): SaleEvent[] {
  const mockItems = [
    {
      id: "1",
      name: "Classic Burger",
      price: 12.0,
      cost: 4.5,
      category: "Burgers",
    },
    {
      id: "2",
      name: "BBQ Bacon Burger",
      price: 15.0,
      cost: 6.0,
      category: "Burgers",
    },
    { id: "3", name: "French Fries", price: 4.0, cost: 1.0, category: "Sides" },
    { id: "4", name: "Onion Rings", price: 5.0, cost: 1.5, category: "Sides" },
    {
      id: "5",
      name: "Caesar Salad",
      price: 10.0,
      cost: 4.0,
      category: "Salads",
    },
    {
      id: "6",
      name: "Chicken Wrap",
      price: 11.0,
      cost: 4.5,
      category: "Wraps",
    },
    {
      id: "7",
      name: "Coca Cola",
      price: 2.5,
      cost: 0.5,
      category: "Beverages",
    },
    {
      id: "8",
      name: "Chocolate Cake",
      price: 6.0,
      cost: 2.0,
      category: "Desserts",
    },
    { id: "9", name: "Pancakes", price: 8.0, cost: 2.5, category: "Breakfast" },
    {
      id: "10",
      name: "Eggs Benedict",
      price: 13.0,
      cost: 5.0,
      category: "Breakfast",
    },
  ];

  const sales: SaleEvent[] = [];
  const today = new Date();

  for (let day = 0; day < days; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() - day);

    // Generate 20-50 sales per day
    const salesCount = Math.floor(Math.random() * 31) + 20;

    for (let i = 0; i < salesCount; i++) {
      const item = mockItems[Math.floor(Math.random() * mockItems.length)];
      const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 items
      const hour = Math.floor(Math.random() * 12) + 8; // 8 AM to 8 PM
      const minute = Math.floor(Math.random() * 60);

      const saleDate = new Date(date);
      saleDate.setHours(hour, minute, 0, 0);

      sales.push({
        date: saleDate.toISOString(),
        menuItemId: item.id,
        itemName: item.name,
        quantitySold: quantity,
        salePrice: item.price,
        costOfGoods: item.cost,
        category: item.category,
        employeeId: `emp_${Math.floor(Math.random() * 5) + 1}`,
        paymentMethod: ["cash", "card", "digital"][
          Math.floor(Math.random() * 3)
        ],
      });
    }
  }

  return sales.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}
