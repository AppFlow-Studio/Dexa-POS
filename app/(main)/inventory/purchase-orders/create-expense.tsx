import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExternalExpenseLineItem } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import BottomSheet, { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import { ChevronDown, Plus, Search, Trash2, User } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { FlatList, TextInput } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
const CreateExternalExpenseScreen = () => {
  const router = useRouter();
  const {
    inventoryItems,
    addExternalExpense,
    purchaseOrders,
    addInventoryItem,
  } = useInventoryStore();
  const { activeEmployeeId, employees, loadMockEmployees } = useEmployeeStore();

  // Main expense state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    activeEmployeeId
  );
  const [expenseItems, setExpenseItems] = useState<ExternalExpenseLineItem[]>(
    []
  );
  const [expenseNotes, setExpenseNotes] = useState("");
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storeLocation, setStoreLocation] = useState("");

  // Bottom sheet refs
  const itemsSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["50%", "85%"], []);

  // Item selection state
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<
    string | null
  >(null);
  const [selectedQuantity, setSelectedQuantity] = useState<string>("1");
  const [selectedUnitPrice, setSelectedUnitPrice] = useState<string>("");
  const [itemNotes, setItemNotes] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const filteredInventoryItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return inventoryItems;
    return inventoryItems.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.unit ?? "").toString().toLowerCase().includes(q)
    );
  }, [inventoryItems, itemSearch]);

  // New item modal state
  const [newItemModalOpen, setNewItemModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("pcs");
  const [newItemCost, setNewItemCost] = useState("");
  const [newItemStock, setNewItemStock] = useState("");
  const [newItemReorder, setNewItemReorder] = useState("");
  const [newItemPOQty, setNewItemPOQty] = useState("1");

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

  const addSelectedItemToExpense = () => {
    if (!selectedInventoryItemId || !selectedQuantity || !selectedUnitPrice) {
      Alert.alert(
        "Missing Information",
        "Please select an item, enter quantity, and unit price."
      );
      return;
    }

    const quantity = parseFloat(selectedQuantity);
    const unitPrice = parseFloat(selectedUnitPrice);

    if (
      isNaN(quantity) ||
      quantity <= 0 ||
      isNaN(unitPrice) ||
      unitPrice <= 0
    ) {
      Alert.alert(
        "Invalid Values",
        "Please enter valid quantity and unit price greater than 0."
      );
      return;
    }

    const selectedItem = inventoryItems.find(
      (item) => item.id === selectedInventoryItemId
    );
    if (!selectedItem) {
      Alert.alert("Error", "Selected item not found.");
      return;
    }

    const newItem: ExternalExpenseLineItem = {
      inventoryItemId: selectedInventoryItemId,
      itemName: selectedItem.name,
      quantity: quantity,
      unitPrice: unitPrice,
      totalAmount: quantity * unitPrice,
      notes: itemNotes.trim() || undefined,
    };

    setExpenseItems((prev) => [...prev, newItem]);

    // Reset and close sheet
    setSelectedInventoryItemId(null);
    setSelectedQuantity("1");
    setSelectedUnitPrice("");
    setItemNotes("");
    itemsSheetRef.current?.close();

    toast.success(`Item added to expense`, {
      duration: 2000,
      position: ToastPosition.BOTTOM,
    });
  };

  const handleCreateNewItem = () => {
    if (!newItemName.trim()) {
      Alert.alert("Please enter item name");
      return;
    }
    const costNum = Number(newItemCost || 0);
    const stockNum = Math.max(0, Number(newItemStock || 0));
    const reorderNum = Math.max(0, Number(newItemReorder || 0));
    const poQty = Math.max(1, Number(newItemPOQty || 1));

    // Create inventory item (no vendor required for external expenses)
    addInventoryItem({
      name: newItemName.trim(),
      category: "Uncategorized",
      stockQuantity: stockNum,
      unit: newItemUnit as any,
      reorderThreshold: reorderNum,
      cost: costNum,
      vendorId: "", // No vendor for external expenses
      stockTrackingMode: "quantity",
    });

    // Retrieve the newly added item (latest by id timestamp)
    const created = useInventoryStore.getState().inventoryItems[0];
    if (created) {
      const newItem: ExternalExpenseLineItem = {
        inventoryItemId: created.id,
        itemName: created.name,
        quantity: poQty,
        unitPrice: costNum,
        totalAmount: poQty * costNum,
        notes: itemNotes.trim() || undefined,
      };
      setExpenseItems((prev) => [...prev, newItem]);
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

    toast.success(`New item created and added to expense`, {
      duration: 2000,
      position: ToastPosition.BOTTOM,
    });
  };

  const handleRemoveItemFromExpense = (index: number) => {
    setExpenseItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateExpense = () => {
    if (expenseItems.length === 0) {
      Alert.alert("No Items", "Please add at least one item to the expense.");
      return;
    }

    if (!selectedEmployeeId) {
      Alert.alert("Missing Information", "Please select an employee.");
      return;
    }

    const selectedEmployee = employees.find(
      (emp) => emp.id === selectedEmployeeId
    );
    if (!selectedEmployee) {
      Alert.alert("Error", "Selected employee not found.");
      return;
    }

    const totalAmount = expenseItems.reduce(
      (sum, item) => sum + item.totalAmount,
      0
    );
    const relatedPO = selectedPOId
      ? purchaseOrders.find((po) => po.id === selectedPOId)
      : null;

    addExternalExpense({
      totalAmount: totalAmount,
      purchasedByEmployeeId: selectedEmployeeId,
      purchasedByEmployeeName: selectedEmployee.fullName,
      purchasedAt: new Date().toISOString(),
      items: expenseItems,
      notes: expenseNotes.trim() || undefined,
      relatedPOId: selectedPOId || undefined,
      relatedPONumber: relatedPO?.poNumber || undefined,
      storeName: storeName.trim() || undefined,
      storeLocation: storeLocation.trim() || undefined,
    });

    toast.success(
      `External expense created with ${expenseItems.length} items`,
      {
        duration: 3000,
        position: ToastPosition.BOTTOM,
      }
    );

    router.back();
  };

  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };

  console.log(filteredInventoryItems.length);
  return (
    <View className="flex-1">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-2xl font-bold text-white">
          Create External Expense
        </Text>
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => router.back()}
            className="py-3 px-4 bg-gray-700 rounded-lg"
          >
            <Text className="text-xl font-bold text-white">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleCreateExpense}
            className="py-3 px-4 bg-blue-600 rounded-lg"
          >
            <Text className="text-xl font-bold text-white">Create</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1">
        <View className="bg-[#303030] border border-gray-700 rounded-xl p-4 mb-4">
          <Text className="text-lg font-medium text-gray-300 mb-1.5">
            Purchased By
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

        <View className="bg-[#303030] border border-gray-700 rounded-xl p-4 mb-4">
          <Text className="text-xl font-semibold text-white mb-1.5">Items</Text>
          <FlatList
            data={expenseItems}
            keyExtractor={(item, index) => `${item.inventoryItemId}-${index}`}
            renderItem={({ item, index }) => (
              <View className="flex-row items-center justify-between p-3 border-b border-gray-600">
                <View className="flex-1">
                  <Text className="text-xl text-white">{item.itemName}</Text>
                  <Text className="text-lg text-gray-300">
                    {item.quantity} × ${item.unitPrice.toFixed(2)} = $
                    {item.totalAmount.toFixed(2)}
                  </Text>
                  {item.notes && (
                    <Text className="text-base text-gray-400">
                      {item.notes}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => handleRemoveItemFromExpense(index)}
                >
                  <Trash2 color="#EF4444" size={20} />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <Text className="text-lg text-gray-400 text-center py-4">
                No items added.
              </Text>
            }
          />
          <TouchableOpacity
            onPress={() => itemsSheetRef.current?.expand()}
            className="mt-3 py-2 border border-dashed rounded-lg items-center border-gray-500"
          >
            <Text className="text-lg font-semibold text-gray-300">
              + Add Item
            </Text>
          </TouchableOpacity>
        </View>

        <View className="bg-[#303030] border border-gray-700 rounded-xl p-4 mb-4">
          <Text className="text-lg font-medium text-gray-300 mb-1.5">
            Related PO (Optional)
          </Text>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TouchableOpacity className="h-fit border border-gray-600 border-dashed rounded-lg p-3 flex-row items-center justify-between">
                <Text className="text-xl text-white">
                  {selectedPOId
                    ? purchaseOrders.find((po) => po.id === selectedPOId)
                        ?.poNumber
                    : "Select..."}
                </Text>
                <ChevronDown color="#9CA3AF" size={18} />
              </TouchableOpacity>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72 bg-[#303030] border-gray-600">
              <DropdownMenuItem
                onPress={() => setSelectedPOId(null)}
                className="flex-row items-center p-2"
              >
                <Text className="text-white text-base font-medium">None</Text>
                {!selectedPOId && (
                  <View className="w-1.5 h-1.5 bg-blue-600 rounded-full ml-auto" />
                )}
              </DropdownMenuItem>
              {purchaseOrders.map((po) => (
                <DropdownMenuItem
                  key={po.id}
                  onPress={() => setSelectedPOId(po.id)}
                  className="flex-row items-center p-2"
                >
                  <View className="flex-1">
                    <Text className="text-white text-base font-medium">
                      {po.poNumber}
                    </Text>
                    <Text className="text-gray-400 text-xs">
                      {po.status} • $
                      {po.items
                        .reduce(
                          (sum, item) => sum + item.cost * item.quantity,
                          0
                        )
                        .toFixed(2)}
                    </Text>
                  </View>
                  {selectedPOId === po.id && (
                    <View className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </View>

        <View className="bg-[#303030] border border-gray-700 rounded-xl p-4 mb-4">
          <Text className="text-lg font-medium text-gray-300 mb-2">
            Store Info (Optional)
          </Text>
          <View className="gap-3">
            <View>
              <Text className="text-white text-base mb-1.5">Store Name</Text>
              <TextInput
                value={storeName}

                placeholderTextColor="#9CA3AF"

                onChangeText={setStoreName}
                placeholder="e.g., Fresh Market"
                className="text-white text-base bg-[#212121] border border-gray-700 rounded-lg px-2 py-1.5 h-10"
              />
            </View>
            <View>
              <Text className="text-white text-base mb-1.5">Location</Text>
              <TextInput
                value={storeLocation}
                onChangeText={setStoreLocation}
                placeholder="e.g., 123 Main St"
                className="text-white text-base bg-[#212121] border border-gray-700 rounded-lg px-2 py-1.5 h-10"
                 placeholderTextColor="#9CA3AF"

              />
            </View>
          </View>
        </View>

        <View className="bg-[#303030] border border-gray-700 rounded-xl p-4 mb-4">
          <Text className="text-lg font-medium text-gray-300 mb-1.5">
            Notes (Optional)
          </Text>
          <TextInput
            value={expenseNotes}
            onChangeText={setExpenseNotes}

            placeholderTextColor="#9CA3AF"
            placeholder="e.g., Vendor delay"
            multiline
            className="text-white text-base bg-[#212121] border border-gray-700 rounded-lg px-2 py-1.5 min-h-[80px]"
          />
        </View>
      </ScrollView>

      <BottomSheet
        ref={itemsSheetRef}
        index={-1}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: "#2b2b2b" }}
        handleIndicatorStyle={{ backgroundColor: "#666" }}
      >
        <View className="px-3 border-b border-gray-700 flex-row items-center justify-between">
          <Text className="text-white text-lg font-bold">Select Item</Text>
          <View className="mb-2 w-1/3 flex-row items-center gap-1.5 bg-[#2a2a2a] border border-gray-700 rounded-lg px-2 py-1.5">
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
        <View className="px-3">
          {selectedInventoryItemId && (
            <View className="mb-3 p-2 rounded-lg border border-gray-700 bg-[#8f8f8f]">
              <Text className="text-white mb-1.5 text-base font-semibold">
                Details -{" "}
                {
                  inventoryItems.find((i) => i.id === selectedInventoryItemId)
                    ?.name
                }
              </Text>
              <View className="flex-row gap-2 mb-2">
                <View className="flex-1">
                  <Text className="text-white text-xs mb-1">Qty</Text>
                  <TextInput
                    keyboardType="number-pad"
                    value={selectedQuantity}
                    onChangeText={setSelectedQuantity}
                    placeholder="1"
                    className="text-white text-base bg-[#2a2a2a] border border-gray-700 rounded-lg px-2 py-1.5 h-10"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-white text-xs mb-1">Unit Price</Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    value={selectedUnitPrice}
                    onChangeText={setSelectedUnitPrice}
                    placeholder="0.00"
                    className="text-white text-base bg-[#2a2a2a] border border-gray-700 rounded-lg px-2 py-1.5 h-10"
                  />
                </View>
              </View>
              <View className="mb-2">
                <Text className="text-white text-xs mb-1">Notes</Text>
                <TextInput
                  value={itemNotes}
                  onChangeText={setItemNotes}
                  placeholder="e.g., Organic"
                  className="text-white text-base bg-[#2a2a2a] border border-gray-700 rounded-lg px-2 py-1.5 h-10"
                />
              </View>
              <Button
                onPress={addSelectedItemToExpense}
                className="bg-blue-600 border border-blue-500 py-1.5"
              >
                <Text className="text-white text-sm">Add to Expense</Text>
              </Button>
            </View>
          )}
          <BottomSheetFlatList
            data={filteredInventoryItems}
            keyExtractor={(i: any) => i.id}
            contentContainerStyle={{ paddingBottom: 60 }}
            renderItem={({ item }: { item: any }) => (
              <TouchableOpacity
                onPress={() => {
                  setSelectedInventoryItemId(item.id);
                  setSelectedUnitPrice(item.cost.toString());
                }}
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
              <Text className="text-gray-400 px-3 py-4">No items match.</Text>
            }
          />
        </View>
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
              <Text className="text-gray-300 text-sm">Name</Text>
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
              <Text className="text-gray-300 mt-2 text-sm">Expense Qty</Text>
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
                    Add Item
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </DialogContent>
      </Dialog>
    </View>
  );
};

export default CreateExternalExpenseScreen;
