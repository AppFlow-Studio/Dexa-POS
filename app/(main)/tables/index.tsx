// File: /app/(main)/tables/index.tsx
import { GuestCountModal } from "@/components/tables/GuestCountModal";
import TableLayoutView from "@/components/tables/TableLayoutView";
import TableListItem from "@/components/tables/TableListItem";
import { TableType } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { Href, useRouter } from "expo-router";
import { Search } from "lucide-react-native";
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
  const [expandedTableId, setExpandedTableId] = useState<string | null>(null); // State for expanded item

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

  // New handler specifically for toggling the expanded state in the list
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
        <View className="w-[370px] bg-[#212121] border-r border-gray-700">
          <View className="p-4 border-b border-gray-700">
            <Text className="text-2xl font-bold text-white">Tables List</Text>
          </View>
          <FlatList
            data={filteredTables.filter(
              (table) =>
                table.type === "table" && table.status !== "Not in Service"
            )}
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
            extraData={expandedTableId} // Ensures re-render on expand
          />
        </View>

        <View className="flex-1 p-4">
          <View className="flex-row items-center bg-[#303030] border border-gray-600 p-1 rounded-xl mb-3 self-start">
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

          <View className="flex-row items-end gap-2 w-full justify-end mb-3">
            <View className="flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-3 flex-1 max-w-sm">
              <Search color="#9CA3AF" size={20} />
              <TextInput
                placeholder="Search table name..."
                placeholderTextColor="#9CA3AF"
                value={searchText}
                onChangeText={setSearchText}
                className="ml-2 text-lg h-16 flex-1 text-white"
              />
            </View>
            <TouchableOpacity
              onPress={() => router.push(`/tables/floor-plan` as Href)}
              className="py-3 px-5 h-16 flex-row items-center justify-center rounded-lg bg-blue-500 "
            >
              <Text className="text-lg font-bold text-white">Edit Layout</Text>
            </TouchableOpacity>
          </View>

          <View className="bg-[#212121] border border-gray-700 rounded-xl flex-1 ">
            <View className="flex-row items-center gap-4 my-3 ml-3">
              <View className="flex-row items-center gap-2">
                <View className="w-4 h-4 rounded-full bg-green-500" />
                <Text className="text-lg font-semibold text-white">
                  Available
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="w-4 h-4 rounded-full bg-blue-500" />
                <Text className="text-lg font-semibold text-white">In Use</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="w-4 h-4 rounded-full bg-red-500" />
                <Text className="text-lg font-semibold text-white">
                  Needs Cleaning
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="w-4 h-4 rounded-full bg-yellow-500" />
                <Text className="text-lg font-semibold text-white">
                  Overtime
                </Text>
              </View>
            </View>

            {/* Floor Plan Area */}
            <TableLayoutView
              tables={activeLayout?.tables || []}
              isSelectionMode={true}
              onTableSelect={handleTablePress}
              showConnections={true}
              layoutId={activeLayoutId || ""}
            />
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
