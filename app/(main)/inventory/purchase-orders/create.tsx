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
import { ChevronDown, Plus, Search, Trash2, User } from "lucide-react-native";
import { default as React, useEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { FlatList, ScrollView, TextInput } from "react-native-gesture-handler";
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
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    activeEmployeeId
  );
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
  const [itemSearch, setItemSearch] = useState("");
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

  const filteredVendorItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return vendorItems;
    return vendorItems.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.unit ?? "").toString().toLowerCase().includes(q)
    );
  }, [vendorItems, itemSearch]);

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
    const assignedEmployee = employees.find((e) => e.id === selectedEmployeeId);
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
    const assignedEmployee = employees.find((e) => e.id === selectedEmployeeId);
    createPurchaseOrder({
      vendorId: selectedVendorId,
      status: "Pending Delivery",
      items: lineItems,

      createdByEmployeeId: selectedEmployeeId || undefined,
      createdByEmployeeName: assignedEmployee?.fullName,
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
    vendorsSheetRef.current?.close();
    if (!po) return;
    setLineItems(po.items);
    setSelectedVendorId(po.vendorId);
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
    <>
      <ScrollView
        bounces={false}
        className="flex-1 flex-grow h-full"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <View className="flex-row justify-between items-center mb-4">
          <Text className="text-2xl font-bold text-white">
            Create Purchase Order
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => router.back()}
              className="py-3 px-4 bg-gray-600 rounded-lg"
            >
              <Text className="text-xl font-bold text-white">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              className="py-3 px-4 bg-gray-600 rounded-lg"
            >
              <Text className="text-xl font-bold text-white">Save Draft</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              className="py-3 px-4 bg-blue-600 rounded-lg"
            >
              <Text className="text-xl font-bold text-white">Submit</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="bg-[#303030] border border-gray-700 rounded-xl p-4">
          <Text className="text-lg font-medium text-gray-300 mb-1.5">
            Vendor
          </Text>
          <TouchableOpacity
            className="h-fit border border-gray-600 border-dashed rounded-lg p-3"
            onPress={() => vendorsSheetRef.current?.expand()}
          >
            <Text className="text-xl text-white">
              {selectedVendorId
                ? vendorOptions.find((v) => v.value === selectedVendorId)?.label
                : "Select a vendor..."}
            </Text>
          </TouchableOpacity>

          <View className="mt-4">
            <Text className="text-lg font-medium text-gray-300 mb-1.5">
              Assigned Employee
            </Text>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <TouchableOpacity className="h-fit border border-gray-600 border-dashed rounded-lg p-3 flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <User color="#9CA3AF" size={18} className="mr-1.5" />
                    <Text className="text-xl text-white">
                      {selectedEmployeeId
                        ? employees.find((e) => e.id === selectedEmployeeId)
                            ?.fullName
                        : "Select..."}
                    </Text>
                  </View>
                  <ChevronDown color="#9CA3AF" size={18} />
                </TouchableOpacity>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72 bg-[#303030] border-gray-600">
                {employees.map((employee) => (
                  <DropdownMenuItem
                    key={employee.id}
                    onPress={() => setSelectedEmployeeId(employee.id)}
                    className="flex-row items-center p-2"
                  >
                    <View className="flex-row items-center flex-1">
                      <View className="w-7 h-7 bg-blue-600 rounded-full items-center justify-center mr-2">
                        <Text className="text-white text-xs font-semibold">
                          {employee.fullName
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()}
                        </Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-white text-base font-medium">
                          {employee.fullName}
                        </Text>
                        <Text className="text-gray-400 text-xs">
                          {employee.shiftStatus === "clocked_in"
                            ? "Clocked In"
                            : "Clocked Out"}
                        </Text>
                      </View>
                      {selectedEmployeeId === employee.id && (
                        <View className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                      )}
                    </View>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </View>

          <View className="mt-4">
            <Text className="text-xl font-semibold text-white mb-1.5">
              Items
            </Text>
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
                    <View className="flex-row items-center gap-x-1.5 w-36">
                      <TextInput
                        value={item.quantity.toString()}
                        onChangeText={(text) =>
                          handleQuantityChange(item.inventoryItemId, text)
                        }
                        keyboardType="number-pad"
                        className="w-16 bg-[#212121] border border-gray-500 rounded-lg text-lg text-white text-center h-10"
                      />
                      <Text className="text-lg text-gray-300">
                        {invItem?.unit}
                      </Text>
                    </View>
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
              disabled={!selectedVendorId}
              onPress={() => itemsSheetRef.current?.expand()}
              className={`mt-3 py-2 border border-dashed rounded-lg items-center ${
                selectedVendorId
                  ? "border-gray-500"
                  : "border-gray-700 opacity-50"
              }`}
            >
              <Text className="text-lg font-semibold text-gray-300">
                + Add Item
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <BottomSheet
        ref={itemsSheetRef}
        index={-1}
        snapPoints={["50%", "95%"]}
        backgroundStyle={{ backgroundColor: "#2b2b2b" }}
        handleIndicatorStyle={{ backgroundColor: "#666" }}
      >
        <BottomSheetView className="h-full flex-grow flex-1">
          <View className="px-3 pt-1 pb-2 border-b border-gray-700 flex-row items-center justify-between">
            <Text className="text-white text-lg font-bold">Select Item</Text>
            <View className="flex-row items-center justify-between gap-1.5">
              <View className="w-1/2 flex-row items-center gap-1.5 bg-[#2a2a2a] border border-gray-700 rounded-lg px-2 py-1.5">
                <Search color="#9CA3AF" size={16} />
                <TextInput
                  value={itemSearch}
                  onChangeText={setItemSearch}
                  placeholder="Search..."
                  className="text-white h-10 w-full text-sm"
                />
              </View>
              <Button
                onPress={() => setNewItemModalOpen(true)}
                className="bg-blue-600 border flex-row items-center gap-1.5 border-blue-500 px-2 py-1"
              >
                <Plus color="#fff" size={18} />
                <Text className="text-white text-sm">New</Text>
              </Button>
            </View>
          </View>

          <View className="px-3 py-2">
            {!selectedVendorId ? (
              <Text className="text-gray-400 text-sm">Select a vendor.</Text>
            ) : vendorItems.length === 0 ? (
              <Text className="text-gray-400 text-sm">
                No items for this vendor.
              </Text>
            ) : (
              <>
                {selectedInventoryItemId && (
                  <View className="mb-3 p-2 rounded-lg border border-gray-700 bg-[#303030]">
                    <Text className="text-white mb-1.5 text-base font-semibold">
                      Qty -{" "}
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
                      className="text-white text-base bg-[#2a2a2a] border border-gray-700 rounded-lg px-2 py-1.5 mb-2 h-16"
                    />
                    <Button
                      onPress={addSelectedItemToPO}
                      className="bg-blue-600 border border-blue-500 py-1.5"
                    >
                      <Text className="text-white text-sm">Add to PO</Text>
                    </Button>
                  </View>
                )}
                <FlatList
                  data={filteredVendorItems}
                  contentContainerStyle={{ paddingBottom: 50 }}
                  keyExtractor={(i: any) => i.id}
                  renderItem={({ item }: { item: any }) => (
                    <TouchableOpacity
                      onPress={() => setSelectedInventoryItemId(item.id)}
                      className="p-3 border-b border-gray-700"
                    >
                      <View className="flex-row justify-between items-center">
                        <View className="flex-1 pr-2">
                          <Text className="text-white text-base font-semibold">
                            {item.name}
                          </Text>
                          <Text className="text-gray-400 text-xs">
                            Unit: {item.unit} • Cost: ${item.cost.toFixed(2)}
                          </Text>
                        </View>
                        <Text className="text-gray-300 text-sm">
                          Stock: {item.stockQuantity}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <Text className="text-gray-400 px-3 py-4">
                      No items match.
                    </Text>
                  }
                />
              </>
            )}
          </View>
        </BottomSheetView>
      </BottomSheet>

      <Dialog open={newItemModalOpen} onOpenChange={setNewItemModalOpen}>
        <DialogContent>
          <ScrollView
            bounces={false}
            className="rounded-2xl h-fit p-4 w-[550px]"
            style={{
              backgroundColor: "#2b2b2b",
              borderWidth: 1,
              borderColor: "#4b5563",
            }}
          >
            <Text className="text-white text-xl font-bold mb-3">
              Add Inventory Item
            </Text>
            <View className="gap-y-2">
              <Text className="text-gray-300 text-sm">Vendor</Text>
              <View className="bg-[#303030] border border-gray-700 rounded-lg p-2">
                <Text className="text-white text-base">
                  {
                    vendorOptions.find((v) => v.value === selectedVendorId)
                      ?.label
                  }
                </Text>
              </View>
              <Text className="text-gray-300 mt-2 text-sm">Name</Text>
              <TextInput
                value={newItemName}
                onChangeText={setNewItemName}
                className="text-white text-base bg-[#303030] border border-gray-700 rounded-lg px-2 py-1.5"
              />
              <Text className="text-gray-300 mt-2 text-sm">Unit</Text>
              <TextInput
                value={newItemUnit}
                onChangeText={setNewItemUnit}
                className="text-white text-base bg-[#303030] border border-gray-700 rounded-lg px-2 py-1.5"
              />
              <Text className="text-gray-300 mt-2 text-sm">Cost/Unit</Text>
              <TextInput
                keyboardType="decimal-pad"
                value={newItemCost}
                onChangeText={setNewItemCost}
                className="text-white text-base bg-[#303030] border border-gray-700 rounded-lg px-2 py-1.5"
              />
              <Text className="text-gray-300 mt-2 text-sm">Stock Qty</Text>
              <TextInput
                keyboardType="number-pad"
                value={newItemStock}
                onChangeText={setNewItemStock}
                className="text-white text-base bg-[#303030] border border-gray-700 rounded-lg px-2 py-1.5"
              />
              <Text className="text-gray-300 mt-2 text-sm">Reorder</Text>
              <TextInput
                keyboardType="number-pad"
                value={newItemReorder}
                onChangeText={setNewItemReorder}
                className="text-white text-base bg-[#303030] border border-gray-700 rounded-lg px-2 py-1.5"
              />
              <Text className="text-gray-300 mt-2 text-sm">PO Qty</Text>
              <TextInput
                keyboardType="number-pad"
                value={newItemPOQty}
                onChangeText={setNewItemPOQty}
                className="text-white text-base bg-[#303030] border border-gray-700 rounded-lg px-2 py-1.5"
              />
              <View className="flex-row gap-2 mt-3">
                <TouchableOpacity
                  onPress={() => setNewItemModalOpen(false)}
                  className="flex-1 py-2 rounded-lg border border-gray-600 items-center"
                >
                  <Text className="text-gray-300 text-base">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCreateNewItem}
                  className="flex-1 py-2 rounded-lg bg-blue-600 border border-blue-500 items-center"
                >
                  <Text className="text-white text-base font-semibold">
                    Add
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
    </>
  );
};

export default CreatePurchaseOrderScreen;
