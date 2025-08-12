import DraggableTable from "@/components/tables/DraggableTable";
import TableListItem from "@/components/tables/TableListItem";
import { MOCK_TABLES } from "@/lib/mockData";
import { useTableStore } from "@/stores/useTableStore";
import { Search } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type TablePositions = {
  [key: string]: { x: number; y: number };
};

// Reusable Select Component (can be moved to its own file)
const ReusableSelect = ({
  options,
  placeholder,
}: {
  options: string[];
  placeholder: string;
}) => (
  <TouchableOpacity className="flex-row items-center justify-between p-3 bg-white border border-gray-200 rounded-lg min-w-[150px]">
    <Text className="font-semibold text-gray-600">{placeholder}</Text>
    {/* Icon would go here */}
  </TouchableOpacity>
);

const TablesScreen = () => {
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Table");
  const [capacityFilter, setCapacityFilter] = useState("All Capacity");
  const [tablePositions, setTablePositions] = useState<TablePositions>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const { tables, updateTablePosition } = useTableStore();

  const filteredTables = useMemo(() => {
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
  }, [searchText, statusFilter, capacityFilter]);

  // Initialize positions from mock data when the component mounts
  useEffect(() => {
    const initialPositions = MOCK_TABLES.reduce((acc, table) => {
      acc[table.id] = { x: table.x, y: table.y };
      return acc;
    }, {} as TablePositions);
    setTablePositions(initialPositions);
  }, []);

  // Callback for when a drag gesture ends
  const handleDragEnd = (
    tableId: string,
    newPosition: { x: number; y: number }
  ) => {
    setTablePositions((prev) => ({
      ...prev,
      [tableId]: newPosition,
    }));
    // In a real app, you would also save this new position to your backend here.
  };

  return (
    <View className="flex-1 flex-row bg-gray-50">
      {/* --- Left Panel: Tables List --- */}
      <View className="w-96 bg-white border-r border-gray-200">
        <View className="p-4 border-b border-gray-100">
          <Text className="text-2xl font-bold text-gray-800">Tables List</Text>
        </View>
        <FlatList
          data={filteredTables}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TableListItem table={item} />}
        />
      </View>

      {/* --- Right Panel: Floor Plan --- */}
      <View className="flex-1 p-6">
        {/* Toolbar */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center bg-white border border-gray-200 rounded-lg p-3 flex-1 max-w-xs">
            <Search color="#6b7280" size={20} />
            <TextInput
              placeholder="Search table name..."
              value={searchText}
              onChangeText={setSearchText}
              className="ml-2 text-base flex-1"
            />
          </View>
          <View className="flex-row items-center space-x-2">
            <ReusableSelect
              options={["All Table", "Available", "In Use", "Needs Cleaning"]}
              placeholder={statusFilter}
            />
            <ReusableSelect
              options={["All Capacity", "Small", "Medium", "Large"]}
              placeholder={capacityFilter}
            />
            <TouchableOpacity
              onPress={() => setIsEditMode((prev) => !prev)}
              className={`py-3 px-5 rounded-lg ${isEditMode ? "bg-green-500" : "bg-primary-400"}`}
            >
              <Text className="font-bold text-white">
                {isEditMode ? "Save Layout" : "Edit Layout"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Legend */}
        <View className="flex-row items-center space-x-6 my-4">
          <View className="flex-row items-center space-x-2">
            <View className="w-3 h-3 rounded-full bg-green-500" />
            <Text className="font-semibold text-gray-600">Available</Text>
          </View>
          <View className="flex-row items-center space-x-2">
            <View className="w-3 h-3 rounded-full bg-red-500" />
            <Text className="font-semibold text-gray-600">In Use</Text>
          </View>
          <View className="flex-row items-center space-x-2">
            <View className="w-3 h-3 rounded-full bg-gray-400" />
            <Text className="font-semibold text-gray-600">Needs Cleaning</Text>
          </View>
        </View>

        {/* Floor Plan Area */}
        <View className="flex-1 mt-4 bg-white border border-gray-200 rounded-xl relative overflow-hidden">
          {filteredTables.map(
            (table) =>
              // Ensure we only render if the position is initialized
              tablePositions[table.id] && (
                <DraggableTable
                  key={table.id}
                  table={table}
                  position={tablePositions[table.id]}
                  onDragEnd={handleDragEnd}
                  isEditMode={isEditMode}
                />
              )
          )}
          {/* ... Cashier and other static elements ... */}
        </View>
      </View>
    </View>
  );
};

export default TablesScreen;
