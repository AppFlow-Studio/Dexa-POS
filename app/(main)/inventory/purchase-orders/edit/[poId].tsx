import AddIngredientModal from "@/components/inventory/AddIngredientModal";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { POLineItem, RecipeItem } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const EditPurchaseOrderScreen = () => {
  const router = useRouter();
  const { poId } = useLocalSearchParams();
  const { vendors, inventoryItems, purchaseOrders, updatePurchaseOrder } =
    useInventoryStore();

  const poToEdit = purchaseOrders.find((p) => p.id === poId);

  const [selectedVendorId, setSelectedVendorId] = useState<
    string | undefined
  >();
  const [lineItems, setLineItems] = useState<POLineItem[]>([]);
  const [isItemModalOpen, setItemModalOpen] = useState(false);

  useEffect(() => {
    if (poToEdit) {
      setSelectedVendorId(poToEdit.vendorId);
      setLineItems(poToEdit.items);
    }
  }, [poToEdit]);

  const vendorOptions = vendors.map((v) => ({ label: v.name, value: v.id }));

  const handleAddLineItem = (ingredient: RecipeItem) => {
    const item = inventoryItems.find(
      (i) => i.id === ingredient.inventoryItemId
    );
    if (!item || lineItems.some((li) => li.inventoryItemId === item.id)) return;

    const newLineItem: POLineItem = {
      inventoryItemId: item.id,
      quantity: ingredient.quantity,
      cost: item.cost,
    };
    setLineItems((prev) => [...prev, newLineItem]);
  };

  const handleRemoveLineItem = (itemId: string) => {
    setLineItems((prev) =>
      prev.filter((item) => item.inventoryItemId !== itemId)
    );
  };

  const handleSave = () => {
    if (!selectedVendorId || lineItems.length === 0 || !poId) return;
    updatePurchaseOrder(poId as string, {
      vendorId: selectedVendorId,
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

  if (!poToEdit)
    return (
      <View>
        <Text className="text-xl text-white">Purchase Order not found.</Text>
      </View>
    );
  if (poToEdit.status !== "Draft")
    return (
      <View>
        <Text className="text-xl text-white">
          This PO has been submitted and can no longer be edited.
        </Text>
      </View>
    );

  return (
    <View className="flex-1">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-2xl font-bold text-white">
          Edit PO {poToEdit.poNumber}
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          className="py-3 px-4 bg-blue-600 rounded-lg"
        >
          <Text className="text-xl font-bold text-white">Save Changes</Text>
        </TouchableOpacity>
      </View>

      <View className="bg-[#303030] border border-gray-700 rounded-xl p-4">
        <Text className="text-lg font-medium text-gray-300 mb-1.5">Vendor</Text>
        <Select
          value={vendorOptions.find((v) => v.value === selectedVendorId)}
          onValueChange={(opt) => setSelectedVendorId(opt?.value)}
        >
          <SelectTrigger className="w-full p-4 bg-[#212121] border border-gray-600 rounded-lg">
            <SelectValue
              className="text-xl text-white"
              placeholder="Select a vendor..."
            />
          </SelectTrigger>
          <SelectContent insets={contentInsets}>
            <SelectGroup>
              {vendorOptions.map((opt) => (
                <SelectItem key={opt.value} label={opt.label} value={opt.value}>
                  <Text className="text-xl">{opt.label}</Text>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <View className="mt-4">
          <Text className="text-xl font-semibold text-white mb-1.5">Items</Text>
          <FlatList
            data={lineItems}
            keyExtractor={(item) => item.inventoryItemId}
            renderItem={({ item }) => {
              const invItem = inventoryItems.find(
                (i) => i.id === item.inventoryItemId
              );
              return (
                <View className="flex-row items-center justify-between p-3 border-b border-gray-600">
                  <Text className="text-xl text-white flex-1">
                    {invItem?.name}
                  </Text>
                  <Text className="text-lg text-gray-300 w-36">
                    {item.quantity} {invItem?.unit}
                  </Text>
                  <Text className="text-lg text-gray-300 w-36">
                    ${(item.cost * item.quantity).toFixed(2)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveLineItem(item.inventoryItemId)}
                  >
                    <Trash2 color="#EF4444" size={20} />
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text className="text-lg text-gray-400 text-center py-4">
                No items added yet.
              </Text>
            }
          />
          <TouchableOpacity
            onPress={() => setItemModalOpen(true)}
            className="mt-3 py-2 border border-dashed border-gray-500 rounded-lg items-center"
          >
            <Text className="text-lg font-semibold text-gray-300">
              + Add Item
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <AddIngredientModal
        isOpen={isItemModalOpen}
        onClose={() => setItemModalOpen(false)}
        onAddIngredient={handleAddLineItem}
      />
    </View>
  );
};

export default EditPurchaseOrderScreen;
