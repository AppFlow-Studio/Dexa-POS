import { colors } from "@/lib/theme";
import { useInventoryStore } from "@/stores/useInventoryStore";
import {
  AlertTriangle,
  BarChart2,
  Box,
  DollarSign,
  Search,
  TrendingUp,
  Truck,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { FlatList, Text, TextInput, TouchableOpacity, View } from "react-native";

type ReportTab =
  | "On Hand"
  | "Low Stock"
  | "Sales Velocity"
  | "COGS"
  | "Variance"
  | "Vendor Performance";

const REPORT_TABS: { key: ReportTab; icon: any }[] = [
  { key: "On Hand", icon: Box },
  { key: "Low Stock", icon: AlertTriangle },
  { key: "Sales Velocity", icon: TrendingUp },
  { key: "COGS", icon: DollarSign },
  { key: "Variance", icon: BarChart2 },
  { key: "Vendor Performance", icon: Truck },
];

const tableHeaderStyle = {
  fontSize: 11,
  fontWeight: "600" as const,
  color: colors.muted,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
};

const sectionTitleStyle = {
  fontSize: 12,
  fontWeight: "700" as const,
  color: colors.heading,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
};

// --- On Hand ---
const OnHandReport = () => {
  const items = useInventoryStore((s) => s.inventoryItems);
  const [query, setQuery] = useState("");
  const totalValue = items.reduce((a, i) => a + i.stockQuantity * i.cost, 0);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      return (
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.unit.toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: "hidden" }}>
      {/* Summary bar */}
      <View style={{ flexDirection: "row", gap: 0, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {[
          { label: "Total Items", value: items.length, color: colors.teal },
          { label: "Total Value", value: `$${totalValue.toFixed(2)}`, color: colors.teal },
          { label: "Out of Stock", value: items.filter((i) => i.stockQuantity === 0).length, color: colors.danger },
        ].map((s, idx) => (
          <View key={idx} style={{ flex: 1, padding: 12, borderRightWidth: idx < 2 ? 1 : 0, borderRightColor: colors.border }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</Text>
            <Text style={{ fontSize: 18, fontWeight: "700", color: s.color, marginTop: 2 }}>{s.value}</Text>
          </View>
        ))}
      </View>

      {/* Header + Search */}
      <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.panel }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={sectionTitleStyle}>On Hand Table</Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>{filteredItems.length} results</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.screen, borderWidth: 1, borderColor: query ? colors.teal + "55" : colors.border, borderRadius: 8, paddingHorizontal: 10, height: 38, gap: 8 }}>
          <Search size={13} color={query ? colors.teal : colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search item, category, unit..."
            placeholderTextColor={colors.muted}
            style={{ flex: 1, fontSize: 13, color: colors.heading, paddingVertical: 0 }}
          />
        </View>
      </View>

      {/* Table header */}
      <View style={{ flexDirection: "row", paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.screen, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={[tableHeaderStyle, { flex: 2 }]}>Name</Text>
        <Text style={[tableHeaderStyle, { flex: 1 }]}>Category</Text>
        <Text style={[tableHeaderStyle, { width: "12%", textAlign: "right" }]}>Stock</Text>
        <Text style={[tableHeaderStyle, { width: "10%", textAlign: "right" }]}>Unit</Text>
        <Text style={[tableHeaderStyle, { width: "12%", textAlign: "right" }]}>Cost</Text>
        <Text style={[tableHeaderStyle, { width: "14%", textAlign: "right" }]}>Value</Text>
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item, idx) => `${item.id}-${idx}`}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.screen }}>
            <Text numberOfLines={1} style={{ flex: 2, fontSize: 13, fontWeight: "600", color: colors.heading }}>{item.name}</Text>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: colors.label }}>{item.category}</Text>
            <Text style={{ width: "12%", fontSize: 13, fontWeight: "600", color: item.stockQuantity === 0 ? colors.danger : colors.heading, textAlign: "right" }}>{item.stockQuantity}</Text>
            <Text style={{ width: "10%", fontSize: 12, color: colors.muted, textAlign: "right" }}>{item.unit}</Text>
            <Text style={{ width: "12%", fontSize: 12, color: colors.label, textAlign: "right" }}>${item.cost.toFixed(2)}</Text>
            <Text style={{ width: "14%", fontSize: 13, fontWeight: "600", color: colors.teal, textAlign: "right" }}>${(item.stockQuantity * item.cost).toFixed(2)}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>No inventory items found</Text>
          </View>
        }
      />
    </View>
  );
};

// --- Low Stock ---
const LowStockReport = () => {
  const inventoryItems = useInventoryStore((s) => s.inventoryItems);
  const vendors = useInventoryStore((s) => s.vendors);
  const [query, setQuery] = useState("");

  const lowStockItems = useMemo(
    () => inventoryItems.filter((i) => i.stockQuantity <= i.reorderThreshold),
    [inventoryItems]
  );

  const filteredLowStockItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lowStockItems;
    return lowStockItems.filter((item) => {
      const vendorName = getVendorName(item.vendorId).toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        vendorName.includes(q)
      );
    });
  }, [lowStockItems, query, vendors]);

  const getVendorName = (vendorId: string) => vendors.find((v) => v.id === vendorId)?.name || "—";

  return (
    <View style={{ flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: "hidden" }}>
      {/* Summary bar */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {[
          { label: "Low Stock Items", value: lowStockItems.length, color: colors.warning },
          { label: "Critical (qty = 0)", value: lowStockItems.filter((i) => i.stockQuantity === 0).length, color: colors.danger },
          { label: "Est. Reorder Cost", value: `$${lowStockItems.reduce((a, i) => a + i.reorderThreshold * i.cost, 0).toFixed(2)}`, color: colors.teal },
        ].map((s, idx) => (
          <View key={idx} style={{ flex: 1, padding: 12, borderRightWidth: idx < 2 ? 1 : 0, borderRightColor: colors.border }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</Text>
            <Text style={{ fontSize: 18, fontWeight: "700", color: s.color, marginTop: 2 }}>{s.value}</Text>
          </View>
        ))}
      </View>

      {/* Header + Search */}
      <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.panel }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={sectionTitleStyle}>Low Stock Table</Text>
          <Text style={{ fontSize: 11, color: colors.muted }}>{filteredLowStockItems.length} results</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.screen, borderWidth: 1, borderColor: query ? colors.teal + "55" : colors.border, borderRadius: 8, paddingHorizontal: 10, height: 38, gap: 8 }}>
          <Search size={13} color={query ? colors.teal : colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search item, category, vendor..."
            placeholderTextColor={colors.muted}
            style={{ flex: 1, fontSize: 13, color: colors.heading, paddingVertical: 0 }}
          />
        </View>
      </View>

      {/* Table header */}
      <View style={{ flexDirection: "row", paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.screen, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={[tableHeaderStyle, { flex: 2 }]}>Name</Text>
        <Text style={[tableHeaderStyle, { flex: 1 }]}>Category</Text>
        <Text style={[tableHeaderStyle, { width: "12%", textAlign: "right" }]}>Stock</Text>
        <Text style={[tableHeaderStyle, { width: "12%", textAlign: "right" }]}>Threshold</Text>
        <Text style={[tableHeaderStyle, { flex: 1, textAlign: "right" }]}>Vendor</Text>
      </View>

      <FlatList
        data={filteredLowStockItems}
        keyExtractor={(item, idx) => `${item.id}-${idx}`}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => {
          const isCritical = item.stockQuantity === 0;
          return (
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.screen }}>
              <View style={{ flex: 2, flexDirection: "row", alignItems: "center", gap: 6 }}>
                {isCritical
                  ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger }} />
                  : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning }} />
                }
                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: colors.heading, flex: 1 }}>{item.name}</Text>
              </View>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: colors.label }}>{item.category}</Text>
              <Text style={{ width: "12%", fontSize: 13, fontWeight: "700", color: isCritical ? colors.danger : colors.warning, textAlign: "right" }}>{item.stockQuantity}</Text>
              <Text style={{ width: "12%", fontSize: 12, color: colors.label, textAlign: "right" }}>{item.reorderThreshold}</Text>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: colors.muted, textAlign: "right" }}>{getVendorName(item.vendorId)}</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 6 }}>
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.success + "20", alignItems: "center", justifyContent: "center" }}>
              <AlertTriangle size={18} color={colors.success} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>All items are well stocked</Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>No items are currently below their reorder threshold</Text>
          </View>
        }
      />
    </View>
  );
};

// --- Placeholder ---
const PlaceholderReport = ({ title, icon: Icon }: { title: string; icon: any }) => (
  <View style={{ flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 8 }}>
    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.teal + "15", borderWidth: 1, borderColor: colors.teal + "30", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
      <Icon size={22} color={colors.teal} />
    </View>
    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>{title}</Text>
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.muted + "15", borderRadius: 20 }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted }}>Coming Soon</Text>
    </View>
  </View>
);

// --- Main Screen ---
const ReportsScreen = () => {
  const [activeTab, setActiveTab] = useState<ReportTab>("On Hand");

  const renderContent = () => {
    switch (activeTab) {
      case "On Hand": return <OnHandReport />;
      case "Low Stock": return <LowStockReport />;
      case "Sales Velocity": return <PlaceholderReport title="Sales Velocity Report" icon={TrendingUp} />;
      case "COGS": return <PlaceholderReport title="Cost of Goods Sold" icon={DollarSign} />;
      case "Variance": return <PlaceholderReport title="Inventory Variance Report" icon={BarChart2} />;
      case "Vendor Performance": return <PlaceholderReport title="Vendor Performance Report" icon={Truck} />;
      default: return null;
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Tab bar */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {REPORT_TABS.map(({ key, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setActiveTab(key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 8,
                backgroundColor: isActive ? colors.teal + "20" : colors.panel,
                borderWidth: 1,
                borderColor: isActive ? colors.teal + "50" : colors.border,
              }}
            >
              <Icon size={13} color={isActive ? colors.teal : colors.muted} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: isActive ? colors.teal : colors.label }}>
                {key}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {renderContent()}
    </View>
  );
};

export default ReportsScreen;
