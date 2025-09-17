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
import { useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";
import React, { useRef, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import POVendorsSheet from "./_compoenets/POVendorsSheet";
import BottomSheet from "@gorhom/bottom-sheet";
import { Button } from "@/components/ui/button";

const CreatePurchaseOrderScreen = () => {
  const router = useRouter();
  const { vendors, inventoryItems, createPurchaseOrder, submitPurchaseOrder, purchaseOrders } = useInventoryStore();
  const [selectedVendorId, setSelectedVendorId] = useState<
    string | undefined
  >();
  const [lineItems, setLineItems] = useState<POLineItem[]>([]);
  const [isItemModalOpen, setItemModalOpen] = useState(false);
  const vendorsSheetRef = useRef<BottomSheet>(null);
  const vendorOptions = vendors.map((v) => ({ label: v.name, value: v.id }));

  const handleAddLineItem = (ingredient: RecipeItem) => {
    const item = inventoryItems.find(
      (i) => i.id === ingredient.inventoryItemId
    );
    if (!item) return;

    if (lineItems.some((li) => li.inventoryItemId === item.id)) {
      alert("This item is already in the purchase order.");
      return;
    }

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

  const handleSubmit = () => {
    if (!selectedVendorId || lineItems.length === 0) {
      alert("Please select a vendor and add at least one item.");
      return;
    }
    // First create as Draft, then immediately submit to Pending Delivery
    const tempId = `po_${Date.now()}`; // predict id not ideal, so instead we update latest created
    createPurchaseOrder({ vendorId: selectedVendorId, status: "Pending Delivery", items: lineItems });
    router.back();
  };

  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };

  const handleUseTemplate = (poId: string) => {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return;
    setLineItems(po.items);
    setSelectedVendorId(po.vendorId);
    vendorsSheetRef.current?.close();
  };

  const selectVendor = (vendorId: string) => {
    setSelectedVendorId(vendorId);
    vendorsSheetRef.current?.close();
  };
  return (
    <View className="flex-1">
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-3xl font-bold text-white">Create Purchase Order</Text>
        <View className="flex-row gap-3">
          <TouchableOpacity onPress={handleSave} className="py-4 px-6 bg-gray-600 rounded-lg">
            <Text className="text-2xl font-bold text-white">Save as Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSubmit} className="py-4 px-6 bg-blue-600 rounded-lg">
            <Text className="text-2xl font-bold text-white">Submit</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="bg-[#303030] border border-gray-700 rounded-xl p-6">
        <Text className="text-xl font-medium text-gray-300 mb-2">Vendor</Text>
       <TouchableOpacity  className="h-fit border border-gray-600 border-dashed rounded-lg p-4" onPress={() => vendorsSheetRef.current?.expand()}>
        <Text className="text-2xl text-white">
          {selectedVendorId
            ? vendorOptions.find((v) => v.value === selectedVendorId)?.label
            : "Select a vendor..."}
        </Text>
       </TouchableOpacity>

        <View className="mt-6">
          <Text className="text-2xl font-semibold text-white mb-2">Items</Text>
          <FlatList
            data={lineItems}
            keyExtractor={(item) => item.inventoryItemId}
            renderItem={({ item }) => {
              const invItem = inventoryItems.find(
                (i) => i.id === item.inventoryItemId
              );
              return (
                <View className="flex-row items-center justify-between p-4 border-b border-gray-600">
                  <Text className="text-2xl text-white flex-1">
                    {invItem?.name}
                  </Text>
                  <Text className="text-xl text-gray-300 w-40">
                    {item.quantity} {invItem?.unit}
                  </Text>
                  <Text className="text-xl text-gray-300 w-40">
                    ${(item.cost * item.quantity).toFixed(2)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveLineItem(item.inventoryItemId)}
                  >
                    <Trash2 color="#EF4444" size={24} />
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text className="text-xl text-gray-400 text-center py-6">
                No items added yet.
              </Text>
            }
          />
          <TouchableOpacity
            onPress={() => setItemModalOpen(true)}
            className="mt-4 py-3 border border-dashed border-gray-500 rounded-lg items-center"
          >
            <Text className="text-xl font-semibold text-gray-300">
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
      <POVendorsSheet ref={vendorsSheetRef} onUseTemplate={handleUseTemplate} onSelectVendor={selectVendor} />
    </View>
  );
};

export default CreatePurchaseOrderScreen;
