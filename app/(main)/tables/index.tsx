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

    // Find if there's an open order for this table
    const activeOrder = orders.find(
      (o) =>
        o.service_location_id === table.id &&
        (o.order_status === "Preparing" || "Reday")
    );

    switch (table.status) {
      case "Available":
        // If available, start a new order and navigate to its screen
        router.push(`/tables/${table.id}`); // Navigate to the new dynamic order page
        break;
      case "In Use":
        // If in use, find the active order and navigate to it
        if (activeOrder) {
          router.push(`/tables/${table.id}`);
        } else {
          // Data inconsistency, handle gracefully
          alert(`Error: Table is "In Use" but no open order was found.`);
        }
        break;
      case "Needs Cleaning":
        // If needs cleaning, navigate to the clean table screen
        router.push(`/tables/clean-table/${table.id}`);
        break;
    }
  };

  return (
    <View className="flex-1 bg-gray-50 px-8 py-1">
      <View className="flex-row items-center bg-background-300 border border-background-400 rounded-lg px-4 mb-4">
        <Search color="#6b7280" size={16} />
        <TextInput
          placeholder="Search Customer"
          value={searchCustomerText}
          onChangeText={setSearchCustomerText}
          className="ml-2 text-base flex-1"
        />
      </View>

      <View className="flex-1 flex-row bg-white rounded-lg border border-background-400">
        {/* --- Left Panel: Tables List --- */}
        <View className="w-96 bg-white border-r border-gray-200">
          <View className="p-4 border-b border-gray-100">
            <Text className="text-2xl font-bold text-gray-800">
              Tables List
            </Text>
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
          <View className="flex-row items-end gap-2 w-full justify-end mb-4">
            <View className="flex-row items-center bg-white border border-background-400 rounded-lg px-4 flex-1 max-w-xs">
              <Search color="#6b7280" size={16} />
              <TextInput
                placeholder="Search table name..."
                value={searchText}
                onChangeText={setSearchText}
                className="ml-2 text-base flex-1"
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
              className="py-3 px-5 rounded-lg bg-primary-400 "
            >
              <Text className="font-bold text-white">Edit Layout</Text>
            </TouchableOpacity>
          </View>

          <View className="bg-white border border-gray-200 rounded-xl flex-1 ">
            {/* Legend */}
            <View className="flex-row items-center gap-4 my-4 ml-4">
              <View className="flex-row items-center gap-1">
                <View className="w-3 h-3 rounded-full bg-green-500" />
                <Text className="font-semibold text-gray-600">Available</Text>
              </View>
              <View className="flex-row items-center gap-1">
                <View className="w-3 h-3 rounded-full bg-blue-500" />
                <Text className="font-semibold text-gray-600">In Use</Text>
              </View>
              <View className="flex-row items-center gap-1">
                <View className="w-3 h-3 rounded-full bg-red-500" />
                <Text className="font-semibold text-gray-600">
                  Needs Cleaning
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <View className="w-3 h-3 rounded-full bg-gray-400" />
                <Text className="font-semibold text-gray-600">
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
