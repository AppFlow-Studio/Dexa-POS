import { GuestCountModal } from "@/components/tables/GuestCountModal";
import TableLayoutView from "@/components/tables/TableLayoutView";
import TableListItem from "@/components/tables/TableListItem";
import { TableType } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Href, useRouter } from "expo-router";
import { Search } from "lucide-react-native"; // Added Edit icon for better look
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const TablesScreen = () => {
  const router = useRouter();
  const {
    layouts,
    activeLayoutId,
    setActiveLayout,
    selectedTableIds,
    toggleTableSelection,
    clearSelection,
    updateTableStatus,
  } = useFloorPlanStore();
  const { startNewOrder, setActiveOrder } = useOrderStore();

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Table");
  const [isGuestModalOpen, setGuestModalOpen] = useState(false);
  const [expandedTableId, setExpandedTableId] = useState<string | null>(null);

  const { activeEmployeeId, getSession, showClockInWall } = useTimeclockStore();

  useEffect(() => {
    if (!activeLayoutId && layouts.length > 0) {
      setActiveLayout(layouts[0].id);
    }
    clearSelection();
  }, [activeLayoutId, layouts, setActiveLayout, clearSelection]);

  const activeLayout = useMemo(
    () => layouts.find((l) => l.id === activeLayoutId),
    [layouts, activeLayoutId]
  );

  const filteredTables = useMemo(() => {
    if (!activeLayout) return [];
    // For the list, we only want to show primary tables or standalone tables
    const listableTables = activeLayout.tables.filter(
      (table) => table.isPrimary !== false
    );
    return listableTables.filter((table) => {
      const matchesSearch = table.name
        .toLowerCase()
        .includes(searchText.toLowerCase());
      const matchesStatus =
        statusFilter === "All Table" ||
        table.status === statusFilter.replace(" ", "");
      return matchesSearch && matchesStatus;
    });
  }, [searchText, statusFilter, activeLayout]);

  const isClockedIn = useMemo(() => {
    if (!activeEmployeeId) return false;
    const session = getSession(activeEmployeeId);
    return session?.status === "clockedIn";
  }, [activeEmployeeId, getSession]);

  // Handler for the main floor plan view (no changes here)
  const handleTablePress = (table: TableType) => {
    if (!isClockedIn) {
      showClockInWall();
      return;
    }

    let targetTable = table;
    // If a secondary merged table is clicked, find its primary to act upon the group
    if (table.mergedWith && !table.isPrimary) {
      const primary = activeLayout?.tables.find(
        (t) => t.isPrimary && t.mergedWith?.includes(table.id)
      );
      if (primary) targetTable = primary;
    }

    switch (targetTable.status) {
      case "Available":
        // --- START OF FIX ---
        // Clear any previous selections to ensure a fresh start.
        clearSelection();

        // Check if the target table represents a merged group.
        if (
          targetTable.isPrimary &&
          targetTable.mergedWith &&
          targetTable.mergedWith.length > 0
        ) {
          // It's a merged group. Select all tables in that group.
          const groupIds = [targetTable.id, ...targetTable.mergedWith];
          groupIds.forEach((id) => toggleTableSelection(id));
        } else {
          // It's a standalone table. Just select this one.
          toggleTableSelection(targetTable.id);
        }

        setGuestModalOpen(true);
        // --- END OF FIX ---
        break;
      case "In Use":
        router.push(`/tables/${targetTable.id}`);
        break;
      case "Needs Cleaning":
        router.push(`/tables/clean-table/${targetTable.id}`);
        break;
    }
  };

  const handleToggleExpand = (tableId: string) => {
    if (!isClockedIn) {
      showClockInWall();
      return;
    }
    setExpandedTableId((prev) => (prev === tableId ? null : tableId));
  };

  const handleGuestCountSubmit = (guestCount: number) => {
    const primaryTableId = selectedTableIds[0];
    const newOrder = startNewOrder({ guestCount, tableId: primaryTableId });
    setActiveOrder(newOrder.id);
    selectedTableIds.forEach((tableId) => {
      updateTableStatus(tableId, "In Use");
    });
    setGuestModalOpen(false);
    clearSelection();
    setExpandedTableId(null);
    router.push(`/tables/${primaryTableId}`);
  };

  return (
    <View className="flex-1 bg-[#212121] px-2 py-1">
      <View className="flex-1 flex-row bg-[#212121] rounded-lg border border-gray-700">
        {/* Left Side: Table List */}
        <View className="w-[370px] bg-[#212121] border-r border-gray-700">
          <View className="p-4 border-b border-gray-700">
            <Text className="text-2xl font-bold text-white">Tables List</Text>
          </View>
          <FlatList
            data={filteredTables.filter(
              (table) =>
                table.type === "table" && table.status !== "Not in Service"
            )}
            contentContainerStyle={{ gap: 12 }}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TableListItem
                table={item}
                isExpanded={expandedTableId === item.id}
                onToggleExpand={() => handleToggleExpand(item.id)}
                onNavigateToOrder={() => router.push(`/tables/${item.id}`)}
                activeLayoutId={activeLayoutId}
                handleTablePress={handleTablePress}
              />
            )}
            extraData={expandedTableId}
          />
        </View>

        {/* Right Side: Floor Plan */}
        <View className="flex-1 p-4">
          <View className="flex-row justify-between items-center mb-3">
            {/* Layout Tabs */}
            <View className="flex-row items-center bg-[#303030] border border-gray-600 p-1 rounded-xl self-start">
              {layouts.map((layout) => (
                <TouchableOpacity
                  key={layout.id}
                  onPress={() => setActiveLayout(layout.id)}
                  className={`py-2 px-4 rounded-lg ${
                    activeLayoutId === layout.id ? "bg-[#212121]" : ""
                  }`}
                >
                  <Text
                    className={`text-lg font-semibold ${
                      activeLayoutId === layout.id
                        ? "text-blue-400"
                        : "text-gray-300"
                    }`}
                  >
                    {layout.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search Bar - Edit button removed from here */}
            <View className="flex-row items-center gap-2">
              <View className="flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-3 max-w-sm">
                <Search color="#9CA3AF" size={20} />
                <TextInput
                  placeholder="Search table name..."
                  placeholderTextColor="#9CA3AF"
                  value={searchText}
                  onChangeText={setSearchText}
                  className="ml-2 text-lg h-12 flex-1 text-white"
                />
              </View>
            </View>
          </View>

          {/* Map Container */}
          <View className="bg-[#212121] border border-gray-700 rounded-xl flex-1 relative">
            <TableLayoutView
              tables={activeLayout?.tables || []}
              isSelectionMode={true}
              onTableSelect={handleTablePress}
              showConnections={true}
              layoutId={activeLayoutId || ""}
            />

            {/* NEW: Edit Layout Button (Top Right) */}
            <TouchableOpacity
              onPress={() => router.push(`/tables/floor-plan` as Href)}
              className="absolute top-4 right-4 z-10 py-2 px-4 flex-row items-center justify-center rounded-lg bg-blue-600 shadow-md border border-blue-500"
            >
              <Text className="text-lg font-bold text-white">Edit Layout</Text>
            </TouchableOpacity>

            {/* Status Indicators (Bottom Left) */}
            <View className="absolute bottom-3 left-4 self-center flex-row items-center gap-4 p-2 rounded-full bg-[#1c1c1c]/90 border border-gray-600">
              <View className="flex-row items-center gap-2">
                <View className="w-3 h-3 rounded-full bg-green-500" />
                <Text className="text-base font-semibold text-gray-300">
                  Available
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="w-3 h-3 rounded-full bg-blue-500" />
                <Text className="text-base font-semibold text-gray-300">
                  In Use
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="w-3 h-3 rounded-full bg-red-500" />
                <Text className="text-base font-semibold text-gray-300">
                  Needs Cleaning
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="w-3 h-3 rounded-full bg-yellow-500" />
                <Text className="text-base font-semibold text-gray-300">
                  Overtime
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
      <GuestCountModal
        isOpen={isGuestModalOpen}
        onClose={() => {
          setGuestModalOpen(false);
          clearSelection();
        }}
        onSubmit={handleGuestCountSubmit}
      />
    </View>
  );
};

export default TablesScreen;
