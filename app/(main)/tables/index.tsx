import { GuestCountModal } from "@/components/tables/GuestCountModal";
import TableLayoutView from "@/components/tables/TableLayoutView";
import TableListItem from "@/components/tables/TableListItem";
import { TableType } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
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

const ReusableSelect = ({
  options,
  placeholder,
}: {
  options: string[];
  placeholder: string;
}) => (
  <TouchableOpacity className="flex-row items-center justify-between p-4 bg-[#303030] border border-gray-600 rounded-lg min-w-[200px]">
    <Text className="text-2xl font-semibold text-white">{placeholder}</Text>
    {/* Icon would go here */}
  </TouchableOpacity>
);

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
  const { startNewOrder, setActiveOrder, orders, activeOrderId } =
    useOrderStore();

  const [searchText, setSearchText] = useState("");
  const [searchCustomerText, setSearchCustomerText] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Table");
  const [capacityFilter, setCapacityFilter] = useState("All Capacity");
  const [isJoinMode, setIsJoinMode] = useState(false);
  const [isGuestModalOpen, setGuestModalOpen] = useState(false);

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
    const tables = activeLayout?.tables || [];
    return tables.filter((table) => {
      const matchesSearch = table.name
        .toLowerCase()
        .includes(searchText.toLowerCase());
      const matchesStatus =
        statusFilter === "All Table" ||
        table.status === statusFilter.replace(" ", "");
      const matchesCapacity =
        capacityFilter === "All Capacity" ||
        table.capacity.toString() === capacityFilter;
      return matchesSearch && matchesStatus && matchesCapacity;
    });
  }, [searchText, statusFilter, capacityFilter, activeLayout]);

  const handleTablePress = (table: TableType) => {
    if (isJoinMode) {
      if (table.status === "Available") {
        toggleTableSelection(table.id);
      }
    } else {
      // Find the primary table if part of a merged group
      let targetTable = table;
      if (table.mergedWith && !table.isPrimary) {
        const primary = activeLayout?.tables.find(
          (t) => t.isPrimary && t.mergedWith?.includes(table.id)
        );
        if (primary) targetTable = primary;
      }

      switch (targetTable.status) {
        case "Available":
          toggleTableSelection(targetTable.id);
          setGuestModalOpen(true);
          break;
        case "In Use":
          router.push(`/tables/${targetTable.id}`);
          break;
        case "Needs Cleaning":
          router.push(`/tables/clean-table/${targetTable.id}`);
          break;
      }
    }
  };

  const handleConfirmJoin = () => {
    if (selectedTableIds.length > 1) {
      setGuestModalOpen(true);
    }
  };

  const handleGuestCountSubmit = (guestCount: number) => {
    const primaryTableId = selectedTableIds[0];
    const newOrder = startNewOrder({ guestCount, tableId: primaryTableId });
    setActiveOrder(newOrder.id);

    // Iterate over all selected tables and mark them as "In Use"
    selectedTableIds.forEach((tableId) => {
      updateTableStatus(tableId, "In Use");
    });

    setGuestModalOpen(false);
    clearSelection();
    setIsJoinMode(false);

    router.push(`/tables/${primaryTableId}`);
  };

  return (
    <View className="flex-1 bg-[#212121] px-2 py-1">
      <View className="flex-1 flex-row bg-[#212121] rounded-lg border border-gray-700">
        {/* --- Left Panel: Tables List --- */}
        <View className="w-96 bg-[#212121] border-r border-gray-700">
          <View className="p-6 border-b border-gray-700">
            <Text className="text-3xl font-bold text-white">Tables List</Text>
          </View>
          <FlatList
            data={filteredTables.filter(
              (table) => table.status !== "Not in Service"
            )}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <TableListItem table={item} handleTablePress={handleTablePress} />}
          />
        </View>

        {/* --- Right Panel: Floor Plan --- */}
        <View className="flex-1 p-6">
          {/* Layout/Room Tabs */}
          <View className="flex-row items-center bg-[#303030] border border-gray-600 p-2 rounded-xl mb-4 self-start">
            {layouts.map((layout) => (
              <TouchableOpacity
                key={layout.id}
                onPress={() => setActiveLayout(layout.id)}
                className={`py-3 px-6 rounded-lg ${activeLayoutId === layout.id ? "bg-[#212121]" : ""}`}
              >
                <Text
                  className={`text-xl font-semibold ${activeLayoutId === layout.id ? "text-blue-400" : "text-gray-300"}`}
                >
                  {layout.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Toolbar */}
          <View className="flex-row items-end gap-3 w-full justify-end mb-4">
            <View className="flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4 flex-1 max-w-sm">
              <Search color="#9CA3AF" size={24} />
              <TextInput
                placeholder="Search table name..."
                placeholderTextColor="#9CA3AF"
                value={searchText}
                onChangeText={setSearchText}
                className="ml-3 text-2xl h-20 flex-1 text-white"
              />
            </View>
            {/* <ReusableSelect
              options={["All Table", "Available", "In Use", "Needs Cleaning"]}
              placeholder={statusFilter}
            />
            <ReusableSelect
              options={["All Capacity", "Small", "Medium", "Large"]}
              placeholder={capacityFilter}
            /> */}
            <TouchableOpacity
              onPress={() => router.push(`/(main)/tables/floor-plan` as Href)}
              className="py-4 px-6 h-20 flex-row items-center justify-center rounded-lg bg-blue-500 "
            >
              <Text className="text-2xl font-bold text-white">Edit Layout</Text>
            </TouchableOpacity>
          </View>

          <View className="bg-[#212121] border border-gray-700 rounded-xl flex-1 ">
            {/* Legend */}
            <View className="flex-row items-center gap-6 my-4 ml-4">
              <View className="flex-row items-center gap-2">
                <View className="w-4 h-4 rounded-full bg-green-500" />
                <Text className="text-xl font-semibold text-white">
                  Available
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="w-4 h-4 rounded-full bg-blue-500" />
                <Text className="text-xl font-semibold text-white">In Use</Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="w-4 h-4 rounded-full bg-red-500" />
                <Text className="text-xl font-semibold text-white">
                  Needs Cleaning
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
