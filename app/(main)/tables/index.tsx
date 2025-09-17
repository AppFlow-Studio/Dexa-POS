import DraggableTable from "@/components/tables/DraggableTable";
import TableListItem from "@/components/tables/TableListItem";
import { MOCK_TABLES } from "@/lib/mockData";
import { TableType } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { router } from "expo-router";
import { Search } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";

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
  <TouchableOpacity className="flex-row items-center justify-between p-4 bg-[#303030] border border-gray-600 rounded-lg min-w-[200px]">
    <Text className="text-2xl font-semibold text-white">{placeholder}</Text>
    {/* Icon would go here */}
  </TouchableOpacity>
);

const TablesScreen = () => {
  const [searchText, setSearchText] = useState("");
  const [searchCustomerText, setSearchCustomerText] = useState("");

  const [statusFilter, setStatusFilter] = useState("All Table");
  const [capacityFilter, setCapacityFilter] = useState("All Capacity");
  const [tablePositions, setTablePositions] = useState<TablePositions>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const { tables, updateTablePosition, updateTableStatus } =
    useFloorPlanStore();
  const { orders } = useOrderStore();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .enabled(!isEditMode) // Disable panning the whole canvas if we are editing a single table
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  // Combine gestures
  const combinedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  // 4. Create the animated style for the canvas container
  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

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

  const handleTablePress = (table: TableType) => {
    if (table.type !== "table") return;

    let targetTable = table;
    // Logic to find the primary table in a merged group ---
    if (table.mergedWith && !table.isPrimary) {
      const primaryTable = tables.find(
        (t) => t.isPrimary && t.mergedWith?.includes(table.id)
      );
      if (primaryTable) {
        targetTable = primaryTable;
      }
    }

    // Find if there's an open order for this table
    const activeOrder = orders.find(
      (o) =>
        o.service_location_id === targetTable.id &&
        (o.order_status === "Preparing" || o.order_status === "Ready")
    );

    switch (targetTable.status) {
      case "Available":
        router.push(`/tables/${targetTable.id}`);
        break;
      case "In Use":
        if (activeOrder) {
          router.push(`/tables/${targetTable.id}`);
        } else {
          alert(
            `Error: Table ${targetTable.name} is "In Use" but no open order was found.`
          );
        }
        break;
      case "Needs Cleaning":
        router.push(`/tables/clean-table/${targetTable.id}`);
        break;
    }
  };

  return (
    <View className="flex-1 bg-[#212121] px-8 py-1">
      <View className="flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-6 py-2 mb-4">
        <Search color="#9CA3AF" size={24} />
        <TextInput
          placeholder="Search Customer"
          placeholderTextColor="#9CA3AF"
          value={searchCustomerText}
          onChangeText={setSearchCustomerText}
          className="ml-3 text-2xl flex-1 text-white"
        />
      </View>

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
            renderItem={({ item }) => <TableListItem table={item} />}
          />
        </View>

        {/* --- Right Panel: Floor Plan --- */}
        <View className="flex-1 p-6">
          {/* Toolbar */}
          <View className="flex-row items-end gap-3 w-full justify-end mb-4">
            <View className="flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-4 flex-1 max-w-sm">
              <Search color="#9CA3AF" size={24} />
              <TextInput
                placeholder="Search table name..."
                placeholderTextColor="#9CA3AF"
                value={searchText}
                onChangeText={setSearchText}
                className="ml-3 text-2xl flex-1 text-white"
              />
            </View>
            <ReusableSelect
              options={["All Table", "Available", "In Use", "Needs Cleaning"]}
              placeholder={statusFilter}
            />
            <ReusableSelect
              options={["All Capacity", "Small", "Medium", "Large"]}
              placeholder={capacityFilter}
            />
            <TouchableOpacity
              onPress={() => router.push("/tables/edit-layout")}
              className="py-4 px-6 rounded-lg bg-blue-500 "
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
              <View className="flex-row items-center gap-2">
                <View className="w-4 h-4 rounded-full bg-gray-400" />
                <Text className="text-xl font-semibold text-white">
                  Available Soon
                </Text>
              </View>
            </View>

            {/* Floor Plan Area */}
            <View className="flex-1 mt-4  relative overflow-hidden">
              <GestureDetector gesture={combinedGesture}>
                {/* This Animated.View is our "canvas" that will move and scale */}
                <Animated.View
                  style={canvasAnimatedStyle}
                  className="w-full h-full"
                >
                  <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                    {tables.map((table) => {
                      if (table.isPrimary && table.mergedWith) {
                        const primaryCenter = {
                          x: table.x + 50,
                          y: table.y + 50,
                        }; // Approx center
                        return table.mergedWith.map((mergedId) => {
                          const mergedTable = tables.find(
                            (t) => t.id === mergedId
                          );
                          if (!mergedTable) return null;
                          const mergedCenter = {
                            x: mergedTable.x + 50,
                            y: mergedTable.y + 50,
                          };
                          return (
                            <Line
                              key={`${table.id}-${mergedId}`}
                              x1={primaryCenter.x}
                              y1={primaryCenter.y}
                              x2={mergedCenter.x}
                              y2={mergedCenter.y}
                              stroke="#F59E0B" // Amber-500
                              strokeWidth="4"
                              strokeDasharray="8, 4"
                            />
                          );
                        });
                      }
                      return null;
                    })}
                  </Svg>
                  {tables.map((table) => (
                    <DraggableTable
                      key={table.id}
                      table={table}
                      isEditMode={false} // Never edit mode here
                      isSelected={false} // Never selected here
                      onSelect={() => {}} // Does nothing here
                      canvasScale={scale}
                      onPress={() => handleTablePress(table)}
                    />
                  ))}
                </Animated.View>
              </GestureDetector>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

export default TablesScreen;
