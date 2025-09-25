// Reworked flow: use BottomSheet for item selection instead of modal
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { POLineItem } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useInventoryStore } from "@/stores/useInventoryStore";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import { ChevronDown, Plus, Trash2, User } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { TextInput } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import POVendorsSheet from "./_compoenets/POVendorsSheet";

const CreatePurchaseOrderScreen = () => {
  const router = useRouter();
  const {
    vendors,
    inventoryItems,
    createPurchaseOrder,
    submitPurchaseOrder,
    purchaseOrders,
    addInventoryItem,
  } = useInventoryStore();
  const { activeEmployeeId, employees, loadMockEmployees } = useEmployeeStore();
  const [selectedVendorId, setSelectedVendorId] = useState<
    string | undefined
  >();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(activeEmployeeId);
  const [lineItems, setLineItems] = useState<POLineItem[]>([]);
  const vendorsSheetRef = useRef<BottomSheet>(null);
  const itemsSheetRef = useRef<BottomSheet>(null);
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<
    string | null
  >(null);
  const [selectedQuantity, setSelectedQuantity] = useState<string>("1");
  const [newItemModalOpen, setNewItemModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("pcs");
  const [newItemCost, setNewItemCost] = useState("");
  const [newItemStock, setNewItemStock] = useState("");
  const [newItemReorder, setNewItemReorder] = useState("");
  const [newItemPOQty, setNewItemPOQty] = useState("1");
  const vendorOptions = vendors.map((v) => ({ label: v.name, value: v.id }));

  // Load employees on component mount
  useEffect(() => {
    loadMockEmployees();
  }, [loadMockEmployees]);

  // Update selected employee when activeEmployeeId changes
  useEffect(() => {
    if (activeEmployeeId && !selectedEmployeeId) {
      setSelectedEmployeeId(activeEmployeeId);
    }
  }, [activeEmployeeId, selectedEmployeeId]);

  const vendorItems = useMemo(() => {
    if (!selectedVendorId) return [] as typeof inventoryItems;
    return inventoryItems.filter((i) => i.vendorId === selectedVendorId);
  }, [inventoryItems, selectedVendorId]);

  const addSelectedItemToPO = () => {
    if (!selectedInventoryItemId) return;
    const qtyNum = Math.max(1, Number(selectedQuantity || 1));
    const inv = inventoryItems.find((i) => i.id === selectedInventoryItemId);
    if (!inv) return;
    if (lineItems.some((li) => li.inventoryItemId === inv.id)) {
      alert("This item is already in the purchase order.");
      return;
    }
    const newLine: POLineItem = {
      inventoryItemId: inv.id,
      quantity: qtyNum,
      cost: inv.cost,
    };
    setLineItems((prev) => [...prev, newLine]);
    // reset and close sheet
    setSelectedInventoryItemId(null);
    setSelectedQuantity("1");
    itemsSheetRef.current?.close();
  };

  const handleCreateNewItem = () => {
    if (!selectedVendorId) {
      alert("Please select a vendor first");
      return;
    }
    if (!newItemName.trim()) {
      alert("Please enter item name");
      return;
    }
    const costNum = Number(newItemCost || 0);
    const stockNum = Math.max(0, Number(newItemStock || 0));
    const reorderNum = Math.max(0, Number(newItemReorder || 0));
    const poQty = Math.max(1, Number(newItemPOQty || 1));

    // Create inventory item linked to vendor
    addInventoryItem({
      name: newItemName.trim(),
      category: "Uncategorized",
      stockQuantity: stockNum,
      unit: newItemUnit as any,
      reorderThreshold: reorderNum,
      cost: costNum,
      vendorId: selectedVendorId,
      stockTrackingMode: "quantity",
    });

    // Retrieve the newly added item (latest by id timestamp)
    const created = useInventoryStore.getState().inventoryItems[0];
    if (created && created.vendorId === selectedVendorId) {
      const newLine: POLineItem = {
        inventoryItemId: created.id,
        quantity: poQty,
        cost: created.cost,
      };
      setLineItems((prev) => [...prev, newLine]);
    }

    // Reset and close
    setNewItemName("");
    setNewItemUnit("pcs");
    setNewItemCost("");
    setNewItemStock("");
    setNewItemReorder("");
    setNewItemPOQty("1");
    setNewItemModalOpen(false);
    itemsSheetRef.current?.close();
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
    const assignedEmployee = employees.find(e => e.id === selectedEmployeeId);
    createPurchaseOrder({
      vendorId: selectedVendorId,
      status: "Draft",
      items: lineItems,
      createdByEmployeeId: selectedEmployeeId || undefined,
      createdByEmployeeName: assignedEmployee?.fullName,
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
    const assignedEmployee = employees.find(e => e.id === selectedEmployeeId);
    createPurchaseOrder({
      vendorId: selectedVendorId,
      status: "Pending Delivery",
      items: lineItems,

      createdByEmployeeId: selectedEmployeeId || undefined,
      createdByEmployeeName: assignedEmployee?.fullName
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

  const handleQuantityChange = (itemId: string, text: string) => {
    const newQuantity = parseInt(text, 10);
    setLineItems((prevItems) =>
      prevItems.map((item) => {
        if (item.inventoryItemId === itemId) {
          // If input is empty or invalid, default to 0, otherwise use the parsed number
          return { ...item, quantity: isNaN(newQuantity) ? 0 : newQuantity };
        }
        return item;
      })
    );
  };

  return (
    <View className="flex-1">
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-3xl font-bold text-white">
          Create Purchase Order
        </Text>
        <View className="flex-row gap-3">

          <TouchableOpacity onPress={() => router.back()} className="py-4 px-6 bg-gray-600 rounded-lg">
            <Text className="text-2xl font-bold text-white">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSave} className="py-4 px-6 bg-gray-600 rounded-lg">
            <Text className="text-2xl font-bold text-white">Save as Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSubmit}
            className="py-4 px-6 bg-blue-600 rounded-lg"
          >
            <Text className="text-2xl font-bold text-white">Submit</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="bg-[#303030] border border-gray-700 rounded-xl p-6">
        <Text className="text-xl font-medium text-gray-300 mb-2">Vendor</Text>
        <TouchableOpacity
          className="h-fit border border-gray-600 border-dashed rounded-lg p-4"
          onPress={() => vendorsSheetRef.current?.expand()}
        >
          <Text className="text-2xl text-white">
            {selectedVendorId
              ? vendorOptions.find((v) => v.value === selectedVendorId)?.label
              : "Select a vendor..."}
          </Text>
        </TouchableOpacity>

        <View className="mt-6">
          <Text className="text-xl font-medium text-gray-300 mb-2">Assigned Employee</Text>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TouchableOpacity className="h-fit border border-gray-600 border-dashed rounded-lg p-4 flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <User color="#9CA3AF" size={20} className="mr-2" />
                  <Text className="text-2xl text-white">
                    {selectedEmployeeId
                      ? employees.find((e) => e.id === selectedEmployeeId)?.fullName
                      : "Select an employee..."}
                  </Text>
                </View>
                <ChevronDown color="#9CA3AF" size={20} />
              </TouchableOpacity>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 bg-[#303030] border-gray-600">
              {employees.map((employee) => (
                <DropdownMenuItem
                  key={employee.id}
                  onPress={() => setSelectedEmployeeId(employee.id)}
                  className="flex-row items-center p-3"
                >
                  <View className="flex-row items-center flex-1">
                    <View className="w-8 h-8 bg-blue-600 rounded-full items-center justify-center mr-3">
                      <Text className="text-white text-sm font-semibold">
                        {employee.fullName.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-white text-lg font-medium">
                        {employee.fullName}
                      </Text>
                      <Text className="text-gray-400 text-sm">
                        {employee.shiftStatus === 'clocked_in' ? 'Currently Clocked In' : 'Clocked Out'}
                      </Text>
                    </View>
                    {selectedEmployeeId === employee.id && (
                      <View className="w-2 h-2 bg-blue-600 rounded-full" />
                    )}
                  </View>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </View>

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
                  <View className="flex-row items-center gap-x-2 w-40">
                    <TextInput
                      value={item.quantity.toString()}
                      onChangeText={(text) =>
                        handleQuantityChange(item.inventoryItemId, text)
                      }
                      keyboardType="number-pad"
                      className="w-20 bg-[#212121] border border-gray-500 rounded-lg text-xl text-white text-center h-12"
                    />
                    <Text className="text-xl text-gray-300">
                      {invItem?.unit}
                    </Text>
                  </View>
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
            disabled={!selectedVendorId}
            onPress={() => itemsSheetRef.current?.expand()}
            className={`mt-4 py-3 border border-dashed rounded-lg items-center ${selectedVendorId
              ? "border-gray-500"
              : "border-gray-700 opacity-50"
              }`}
          >
            <Text className="text-xl font-semibold text-gray-300">
              + Add Item
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom sheet for selecting existing items or creating new */}
      <BottomSheet
        ref={itemsSheetRef}
        index={-1}
        snapPoints={["50%", "85%"]}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: "#2b2b2b" }}
        handleIndicatorStyle={{ backgroundColor: "#666" }}
      >
        <BottomSheetView className="flex-1 h-full w-full">
          <View className="px-4 pt-2 pb-3 border-b border-gray-700 flex-row items-center justify-between">
            <Text className="text-white text-xl font-bold">Select Item</Text>
            <Button
              onPress={() => setNewItemModalOpen(true)}
              className="bg-blue-600 border flex-row items-center gap-2 border-blue-500"
            >
              <Plus color="#fff" size={24} />
              <Text className="text-white">Add New Item</Text>
            </Button>
          </View>

          <View className="px-4 py-3">
            {!selectedVendorId ? (
              <Text className="text-gray-400">
                Select a vendor to see their items.
              </Text>
            ) : vendorItems.length === 0 ? (
              <Text className="text-gray-400">
                No items found for this vendor.
              </Text>
            ) : (
              <>
                {/* Quantity selector appears when an item is picked */}
                {selectedInventoryItemId && (
                  <View className="mb-4 p-3 rounded-lg border border-gray-700 bg-[#303030]">
                    <Text className="text-white mb-2 text-xl font-semibold">
                      Enter Quantity -{" "}
                      {
                        vendorItems.find(
                          (i) => i.id === selectedInventoryItemId
                        )?.name
                      }{" "}
                      (
                      {
                        vendorItems.find(
                          (i) => i.id === selectedInventoryItemId
                        )?.unit
                      }
                      )
                    </Text>
                    <TextInput
                      keyboardType="number-pad"
                      value={selectedQuantity}
                      onChangeText={setSelectedQuantity}
                      placeholder="Quantity"
                      placeholderTextColor="#9CA3AF"
                      className="text-white text-lg bg-[#2a2a2a] border border-gray-700 rounded-lg px-3 py-2 mb-3 h-20"
                    />
                    <Button
                      onPress={addSelectedItemToPO}
                      className="bg-blue-600 border border-blue-500"
                    >
                      <Text className="text-white">Add to Purchase Order</Text>
                    </Button>
                  </View>
                )}

                <FlatList
                  data={vendorItems}
                  keyExtractor={(i) => i.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedInventoryItemId(item.id);
                      }}
                      className="p-4 border-b border-gray-700"
                    >
                      <View className="flex-row justify-between items-center">
                        <View className="flex-1 pr-3">
                          <Text className="text-white text-lg font-semibold">
                            {item.name}
                          </Text>
                          <Text className="text-gray-400 text-sm">
                            Unit: {item.unit} • Cost: ${item.cost.toFixed(2)}
                          </Text>
                        </View>
                        <Text className="text-gray-300">
                          Stock: {item.stockQuantity}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </>
            )}
          </View>
        </BottomSheetView>
      </BottomSheet>
      {/* Create New Inventory Item Modal */}
      <Dialog open={newItemModalOpen} onOpenChange={setNewItemModalOpen}>
        <DialogContent className="">
          <ScrollView
            bounces={false}
            className="rounded-2xl h-full p-6 w-[600px]"
            style={{
              backgroundColor: "#2b2b2b",
              borderWidth: 1,
              borderColor: "#4b5563",
            }}
          >
            <Text className="text-white text-2xl font-bold mb-4">
              Add Inventory Item
            </Text>
            <View className="gap-y-3">
              <Text className="text-gray-300">Vendor</Text>
              <View className="bg-[#303030] border border-gray-700 rounded-lg p-3">
                <Text className="text-white text-lg">
                  {vendorOptions.find((v) => v.value === selectedVendorId)
                    ?.label || "Select a vendor"}
                </Text>
              </View>

              <Text className="text-gray-300 mt-3">Item Name</Text>
              <TextInput
                value={newItemName}
                onChangeText={setNewItemName}
                placeholder="e.g., Tomatoes"
                placeholderTextColor="#9CA3AF"
                className="text-white text-lg bg-[#303030] border border-gray-700 rounded-lg px-3 py-2"
              />

              <Text className="text-gray-300 mt-3">Unit</Text>
              <TextInput
                value={newItemUnit}
                onChangeText={setNewItemUnit}
                placeholder="e.g., kg, pcs"
                placeholderTextColor="#9CA3AF"
                className="text-white text-lg bg-[#303030] border border-gray-700 rounded-lg px-3 py-2"
              />

              <Text className="text-gray-300 mt-3">Cost per Unit</Text>
              <TextInput
                keyboardType="decimal-pad"
                value={newItemCost}
                onChangeText={setNewItemCost}
                placeholder="e.g., 2.50"
                placeholderTextColor="#9CA3AF"
                className="text-white text-lg bg-[#303030] border border-gray-700 rounded-lg px-3 py-2"
              />

              <Text className="text-gray-300 mt-3">Stock Quantity</Text>
              <TextInput
                keyboardType="number-pad"
                value={newItemStock}
                onChangeText={setNewItemStock}
                placeholder="e.g., 100"
                placeholderTextColor="#9CA3AF"
                className="text-white text-lg bg-[#303030] border border-gray-700 rounded-lg px-3 py-2"
              />

              <Text className="text-gray-300 mt-3">Reorder Threshold</Text>
              <TextInput
                keyboardType="number-pad"
                value={newItemReorder}
                onChangeText={setNewItemReorder}
                placeholder="e.g., 20"
                placeholderTextColor="#9CA3AF"
                className="text-white text-lg bg-[#303030] border border-gray-700 rounded-lg px-3 py-2"
              />

              <Text className="text-gray-300 mt-3">Quantity for this PO</Text>
              <TextInput
                keyboardType="number-pad"
                value={newItemPOQty}
                onChangeText={setNewItemPOQty}
                placeholder="e.g., 10"
                placeholderTextColor="#9CA3AF"
                className="text-white text-lg bg-[#303030] border border-gray-700 rounded-lg px-3 py-2"
              />

              <View className="flex-row gap-3 mt-4">
                <TouchableOpacity
                  onPress={() => setNewItemModalOpen(false)}
                  className="flex-1 py-3 rounded-lg border border-gray-600 items-center"
                >
                  <Text className="text-gray-300 text-lg">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCreateNewItem}
                  className="flex-1 py-3 rounded-lg bg-blue-600 border border-blue-500 items-center"
                >
                  <Text className="text-white text-lg font-semibold">
                    Add Item
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </DialogContent>
      </Dialog>
      <POVendorsSheet
        ref={vendorsSheetRef}
        onUseTemplate={handleUseTemplate}
        onSelectVendor={selectVendor}
      />
    </View>
  );
};

export default CreatePurchaseOrderScreen;
