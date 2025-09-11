import InventoryRow from "@/components/inventory/InventoryRow";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { MenuItemType } from "@/lib/types";
import { useItemStore } from "@/stores/useItemStore";
import { useRouter } from "expo-router";
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
  const router = useRouter();
  // Fetch items from the new Zustand store
  const { items, updateItem, deleteItem } = useItemStore();
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const handleEdit = (itemId: string) => {
    router.push(`/inventory/${itemId}`);
  };
  const openDeleteModal = (itemId: string) => {
    setItemToDelete(itemId);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) {
      deleteItem(itemToDelete);
    }
    setDeleteModalOpen(false);
    setItemToDelete(null);
  };

  const handleToggleActive = (item: MenuItemType) => {
    const newStatus = item.status === "Active" ? "Inactive" : "Active";
    updateItem(item.id, { status: newStatus });
  };

  return (
    <View className="flex-1 p-6 bg-white">
      <View className="flex-row justify-between items-center my-4">
        {/* Search bar is now part of the toolbar */}
        <View className="flex-row items-center bg-gray-100 rounded-lg px-3 w-[300px]">
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
              onToggleActive={() => handleToggleActive(item)}
              onEdit={() => handleEdit(item.id)}
              onDelete={() => openDeleteModal(item.id)}
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
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Item"
        description="Are you sure you want to permanently delete this item? This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
      />
    </View>
  );
};

export default InventoryScreen;
