import AddItemModal from "@/components/inventory/AddItemModal";
import InventoryRow from "@/components/inventory/InventoryRow"; // Import the new row component
import { MENU_IMAGE_MAP, MOCK_MENU_ITEMS } from "@/lib/mockData";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react-native";
import React, { useState } from "react";
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
  const [isAddModalOpen, setAddModalOpen] = useState(false);

  // Transform MOCK_MENU_ITEMS into inventory format
  const inventoryItems = MOCK_MENU_ITEMS.map((item, index) => ({
    id: item.id,
    serialNo: (index + 1).toString().padStart(3, '0'),
    name: item.name,
    image: item.image ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP] : null,
    description: item.description || "No description available",
    stock: Math.floor(Math.random() * 500) + 50, // Random stock between 50-550
    unit: "PCs" as const,
    lastUpdate: new Date().toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }),
    status: Math.random() > 0.8 ? "Out of Stock" as const : Math.random() > 0.9 ? "Draft" as const : "Active" as const,
    category: item.category,
    modifier: item.modifiers && item.modifiers.length > 0 ? "Customizable" : "None",
    availability: Math.random() > 0.1, // 90% availability
  }));

  // Handlers for the row actions
  const handleViewDetails = () => alert("View Details");
  const handleEdit = () => alert("Edit Item");
  const handleDelete = () => alert("Delete Item");

  return (
    <View className="flex-1 p-6 bg-white">
      <View className="flex-row justify-between items-center my-4">
        {/* Search bar is now part of the toolbar */}
        <View className="flex-row items-center bg-gray-100 rounded-lg p-3 w-[300px]">
          <Search color="#6b7280" size={16} />
          <TextInput
            placeholder="Search Customer"
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
          data={inventoryItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <InventoryRow
              item={item}
              onViewDetails={handleViewDetails}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        />
      </View>

      {/* Footer */}
      <View className="flex-row justify-between items-center mt-4">
        <TouchableOpacity
          onPress={() => setAddModalOpen(true)}
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

      {/* Modals */}
      <AddItemModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
      />
    </View>
  );
};

export default InventoryScreen;
