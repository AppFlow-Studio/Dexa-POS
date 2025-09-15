import InventoryItemFormModal from "@/components/inventory/InventoryItemFormModal";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { POLineItem } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";
import React, { useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CreatePurchaseOrderScreen = () => {
  const router = useRouter();
  const { vendors, inventoryItems, createPurchaseOrder } = useInventoryStore();
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<
    string | undefined
  >();
  const [lineItems, setLineItems] = useState<POLineItem[]>([]);

  const vendorOptions = vendors.map((v) => ({ label: v.name, value: v.id }));

  const handleAddLineItem = (ingredient: {
    inventoryItemId: string;
    quantity: number;
  }) => {
    const item = inventoryItems.find(
      (i) => i.id === ingredient.inventoryItemId
    );
    if (!item) return;

    const newLineItem: POLineItem = {
      inventoryItemId: item.id,
      quantity: ingredient.quantity,
      cost: item.cost, // Use current cost as default
    };
    setLineItems((prev) => [...prev, newLineItem]);
  };

  const handleRemoveLineItem = (itemId: string) => {
    setLineItems((prev) =>
      prev.filter((item) => item.inventoryItemId !== itemId)
    );
  };

  const handleSave = () => {
    if (!selectedVendorId || lineItems.length === 0) {
      alert("Please select a vendor and add at least one item.");
      return;
    }
    createPurchaseOrder({
      vendorId: selectedVendorId,
      status: "Draft",
      items: lineItems,
    });
    router.back();
  };

  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };

  return (
    <View className="flex-1">
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-2xl font-bold text-white">
          Create Purchase Order
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          className="py-3 px-5 bg-blue-600 rounded-lg"
        >
          <Text className="font-bold text-white">Save Purchase Order</Text>
        </TouchableOpacity>
      </View>

      <View className="bg-[#303030] border border-gray-700 rounded-xl p-6">
        <Text className="text-gray-300 font-medium mb-2">Vendor</Text>
        <Select
          value={vendorOptions.find((v) => v.value === selectedVendorId)}
          onValueChange={(opt) => setSelectedVendorId(opt?.value)}
        >
          <SelectTrigger className="w-full p-3 bg-[#212121] border border-gray-600 rounded-lg">
            <SelectValue
              className="text-white"
              placeholder="Select a vendor..."
            />
          </SelectTrigger>
          <SelectContent insets={contentInsets}>
            <SelectGroup>
              {vendorOptions.map((opt) => (
                <SelectItem key={opt.value} label={opt.label} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <View className="mt-6">
          <Text className="text-lg font-semibold text-white mb-2">Items</Text>
          <FlatList
            data={lineItems}
            keyExtractor={(item) => item.inventoryItemId}
            renderItem={({ item }) => {
              const invItem = inventoryItems.find(
                (i) => i.id === item.inventoryItemId
              );
              return (
                <View className="flex-row items-center justify-between p-3 border-b border-gray-600">
                  <Text className="text-white flex-1">{invItem?.name}</Text>
                  <Text className="text-gray-300 w-32">
                    {item.quantity} {invItem?.unit}
                  </Text>
                  <Text className="text-gray-300 w-32">
                    ${(item.cost * item.quantity).toFixed(2)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveLineItem(item.inventoryItemId)}
                  >
                    <Trash2 color="#EF4444" size={18} />
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text className="text-gray-400 text-center py-4">
                No items added yet.
              </Text>
            }
          />
          <TouchableOpacity
            onPress={() => {
              setAddItemModalOpen(true);
            }}
            className="mt-4 py-2 border border-dashed border-gray-500 rounded-lg items-center"
          >
            <Text className="text-gray-300 font-semibold">+ Add Item</Text>
          </TouchableOpacity>
        </View>
      </View>
      <InventoryItemFormModal
        isOpen={addItemModalOpen}
        onClose={() => setAddItemModalOpen(false)}
        onSave={() => {}}
        vendors={vendors}
      />
    </View>
  );
};

export default CreatePurchaseOrderScreen;
