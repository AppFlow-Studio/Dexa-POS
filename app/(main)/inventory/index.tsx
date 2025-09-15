import InventoryItemFormModal from "@/components/inventory/InventoryItemFormModal";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InventoryItem } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useRouter } from "expo-router";
import {
  AlertTriangle,
  Edit,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const InventoryCatalogRow: React.FC<{
  item: InventoryItem;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ item, onEdit, onDelete }) => {
  const isLowStock = item.stockQuantity <= item.reorderThreshold;
  return (
    <View className="flex-row items-center p-4 border-b border-gray-700">
      <Text className="w-[18%] font-semibold text-white">{item.name}</Text>
      <Text className="w-[15%] text-gray-300">{item.category}</Text>
      <View className="w-[12%]">
        <Text
          className={`font-semibold ${isLowStock ? "text-red-400" : "text-white"}`}
        >
          {item.stockQuantity} {item.unit}
        </Text>
      </View>
      <Text className="w-[12%] text-gray-300">
        {item.reorderThreshold} {item.unit}
      </Text>
      <Text className="w-[12%] text-gray-300">${item.cost.toFixed(2)}</Text>
      <Text className="w-[18%] text-gray-300">Sysco Foods</Text>
      <View className="w-[5%] items-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="p-2">
              <MoreHorizontal color="#9CA3AF" />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 bg-[#303030] border-gray-600">
            <DropdownMenuItem onPress={onEdit}>
              <Edit className="mr-2 h-4 w-4" color="#9CA3AF" />
              <Text className="text-white">Edit Item</Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={onDelete}>
              <Trash2 className="mr-2 h-4 w-4 text-red-400" color="#F87171" />
              <Text className="text-red-400">Delete Item</Text>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
    </View>
  );
};

const InventoryScreen = () => {
  const {
    inventoryItems,
    getLowStockItems,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    vendors,
  } = useInventoryStore();
  const lowStockItems = getLowStockItems();
  const router = useRouter();

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleOpenAddModal = () => {
    setSelectedItem(null);
    setModalMode("add");
  };

  const handleOpenEditModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setModalMode("edit");
  };

  const handleCloseModal = () => {
    setModalMode(null);
    setSelectedItem(null);
  };

  const handleSaveItem = (data: Omit<InventoryItem, "id">, id?: string) => {
    if (id) {
      updateInventoryItem(id, data);
    } else {
      addInventoryItem(data);
    }
  };

  const handleOpenDeleteConfirm = (item: InventoryItem) => {
    setSelectedItem(item);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedItem) {
      deleteInventoryItem(selectedItem.id);
    }
    setDeleteConfirmOpen(false);
    setSelectedItem(null);
  };

  const TABLE_HEADERS = [
    "Name",
    "Category",
    "In Stock",
    "Threshold",
    "Cost",
    "Vendor",
    "",
  ];

  return (
    <View className="flex-1">
      {lowStockItems.length > 0 && (
        <View className="mb-6 p-4 bg-red-900/30 border border-red-500 rounded-xl">
          <View className="flex-row items-center mb-3">
            <AlertTriangle color="#F87171" size={20} />
            <Text className="text-xl font-bold text-red-400 ml-2">
              Low Stock Alerts
            </Text>
          </View>
          <View className="gap-y-2">
            {lowStockItems.map((item) => (
              <View
                key={item.id}
                className="flex-row justify-between p-2 bg-red-800/20 rounded-md"
              >
                <Text className="text-white font-medium">{item.name}</Text>
                <Text className="text-red-300">
                  Stock: {item.stockQuantity} (Threshold:{" "}
                  {item.reorderThreshold})
                </Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            onPress={() => router.push("/inventory/purchase-orders/create")}
            className="mt-4 py-2 px-4 bg-blue-600 self-start rounded-lg"
          >
            <Text className="text-white font-semibold">
              Create Purchase Order
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View className="flex-row justify-between items-center mb-4">
        <View className="flex-row items-center bg-[#303030] border border-gray-700 rounded-lg p-3 w-[350px]">
          <Search color="#9CA3AF" size={16} />
          <TextInput
            placeholder="Search by item name..."
            placeholderTextColor="#9CA3AF"
            className="ml-2 text-base text-white flex-1"
          />
        </View>
        <TouchableOpacity
          onPress={handleOpenAddModal}
          className="py-3 px-5 bg-blue-600 rounded-lg flex-row items-center"
        >
          <Plus color="white" size={18} className="mr-2" />
          <Text className="font-bold text-white">Add New Item</Text>
        </TouchableOpacity>
      </View>

      <View className="flex-1 bg-[#303030] border border-gray-700 rounded-xl">
        <View className="flex-row p-4 bg-gray-800/50 rounded-t-xl border-b border-gray-700">
          {TABLE_HEADERS.map((header, index) => (
            <Text
              key={header}
              className={`font-bold text-sm text-gray-400 ${
                header === "Name"
                  ? "w-[18%]"
                  : header === "Vendor"
                    ? "w-[18%]"
                    : header === "In Stock" || header === "Threshold"
                      ? "w-[12%]"
                      : header === "Category" || header === "Cost"
                        ? "w-[15%]"
                        : "w-[5%]"
              }`}
            >
              {header}
            </Text>
          ))}
        </View>
        <FlatList
          data={inventoryItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <InventoryCatalogRow
              item={item}
              onEdit={() => handleOpenEditModal(item)}
              onDelete={() => handleOpenDeleteConfirm(item)}
            />
          )}
        />
      </View>

      <InventoryItemFormModal
        isOpen={modalMode === "add" || modalMode === "edit"}
        onClose={handleCloseModal}
        onSave={handleSaveItem}
        vendors={vendors}
        initialData={selectedItem}
      />

      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Inventory Item"
        description={`Are you sure you want to permanently delete "${selectedItem?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
      />
    </View>
  );
};

export default InventoryScreen;
