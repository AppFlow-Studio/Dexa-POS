import InventoryRow from "@/components/inventory/InventoryRow";
import { useItemStore } from "@/stores/useItemStore";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react-native";
import React from "react";
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const TABLE_HEADERS = [
  { label: "# No", width: "w-[5%]" },
  { label: "Item Name", width: "w-[20%]" },
  { label: "Description", width: "w-[20%]" },
  { label: "Stock", width: "w-[8%]" },
  { label: "Unit", width: "w-[8%]" },
  { label: "Last Update", width: "w-[12%]" },
  { label: "Status", width: "w-[12%]" },
  { label: "", width: "w-[10%]" }, // For the actions column
];

const InventoryScreen = () => {
  const router = useRouter();
  // Fetch items from the new Zustand store
  const { items } = useItemStore();

  // Handlers for the row actions (can be implemented later)
  const handleViewDetails = () => alert("View Details");
  const handleEdit = (itemId: string) => {
    router.push(`/inventory/${itemId}`);
  };
  const handleDelete = () => alert("Delete Item");

  return (
    <View className="flex-1 p-6 bg-white">
      <View className="flex-row justify-between items-center my-4">
        {/* Search bar is now part of the toolbar */}
        <View className="flex-row items-center bg-gray-100 rounded-lg p-3 w-[300px]">
          <Search color="#6b7280" size={16} />
          <TextInput
            placeholder="Search Inventory"
            className="ml-2 text-base flex-1"
          />
        </View>
      </View>

      {/* Table */}
      <View className="flex-1 border border-gray-200 rounded-xl">
        {/* Table Header */}
        <View className="flex-row p-4 bg-gray-50 rounded-t-xl border-b border-gray-200">
          {TABLE_HEADERS.map((header) => (
            <Text
              key={header.label}
              className={`font-bold text-sm text-gray-500 ${header.width}`}
            >
              {header.label}
            </Text>
          ))}
        </View>
        {/* Table Body */}
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <InventoryRow
              item={item}
              onViewDetails={handleViewDetails}
              onEdit={() => handleEdit(item.id)}
              onDelete={handleDelete}
            />
          )}
        />
      </View>

      {/* Footer */}
      <View className="flex-row justify-between items-center mt-4">
        <TouchableOpacity
          onPress={() => router.push("/inventory/add-item")}
          className="flex-row items-center gap-2 py-3 px-5 bg-primary-400 rounded-lg"
        >
          <Plus color="#FFFFFF" size={20} />
          <Text className="font-bold text-white">Add Item</Text>
        </TouchableOpacity>
        <View className="flex-row items-center gap-2">
          <TouchableOpacity className="p-2 border border-gray-300 rounded-md">
            <ChevronLeft color="#4b5563" size={20} />
          </TouchableOpacity>
          <TouchableOpacity className="p-2 border border-gray-300 rounded-md bg-primary-400">
            <ChevronRight color="white" size={20} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default InventoryScreen;
