import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/contexts/ToastContext";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { ExternalExpenseLineItem } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useInventoryStore } from "@/stores/useInventoryStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import { ChevronDown, Plus, Search, Trash2, User } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CreateExternalExpenseScreen = () => {
  const router = useRouter();
  const {
    inventoryItems,
    addExternalExpense,
    purchaseOrders,
    addInventoryItem,
  } = useInventoryStore();
  const { activeEmployeeId, employees } = useEmployeeStore();
  const { show } = useToast();

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

  // Update selected employee when activeEmployeeId changes
  useEffect(() => {
    if (activeEmployeeId && !selectedEmployeeId) {
      setSelectedEmployeeId(activeEmployeeId);
    }
  }, [activeEmployeeId, selectedEmployeeId]);

  const addSelectedItemToExpense = () => {
    if (!selectedInventoryItemId || !selectedQuantity || !selectedUnitPrice) {
      show({
        title: "Missing Details",
        message:
          "Please select an item, and enter a valid quantity and unit price.",
        type: "error",
      });
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
      show({
        title: "Invalid Input",
        message: "Please enter a quantity and unit price greater than 0.",
        type: "error",
      });
      return;
    }

    const selectedItem = inventoryItems.find(
      (item) => item.id === selectedInventoryItemId
    );
    if (!selectedItem) {
      show({
        title: "Item Not Found",
        message: "The selected item could not be found in the inventory.",
        type: "error",
      });
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

    show({
      title: "Item Added",
      message: `${selectedItem.name} has been added to the expense list.`,
      type: "success",
    });
  };

  const handleCreateNewItem = () => {
    if (!newItemName.trim()) {
      show({
        title: "Missing Name",
        message: "Please provide a name for the new item.",
        type: "error",
      });
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

    show({
      title: "Item Created",
      message: `New item '${newItemName.trim()}' created and added to the expense.`,
      type: "success",
    });
  };

  const handleRemoveItemFromExpense = (index: number) => {
    const removedItem = expenseItems[index];
    setExpenseItems((prev) => prev.filter((_, i) => i !== index));
    show({
      title: "Item Removed",
      message: `${removedItem.itemName} has been removed from the expense list.`,
      type: "success",
    });
  };

  const handleCreateExpense = () => {
    if (expenseItems.length === 0) {
      show({
        title: "Empty Expense",
        message: "Please add at least one item before creating the expense.",
        type: "error",
      });
      return;
    }

    if (!selectedEmployeeId) {
      show({
        title: "Employee Not Selected",
        message: "Please select the employee who made the purchase.",
        type: "error",
      });
      return;
    }

    const selectedEmployee = employees.find(
      (emp) => emp.id === selectedEmployeeId
    );
    if (!selectedEmployee) {
      show({
        title: "Employee Not Found",
        message: "The selected employee could not be found.",
        type: "error",
      });
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

    show({
      title: "Expense Created",
      message: `Successfully created an expense with ${expenseItems.length} items.`,
      type: "success",
    });

    router.back();
  };

  const insets = useSafeAreaInsets();

  return (
    <>
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

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <ScrollView className="flex-1">
            <View className="bg-panel border border-border rounded-xl p-4 mb-4">
              <Text className="text-lg font-medium text-gray-300 mb-1.5">
                Purchased By
              </Text>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <TouchableOpacity className="h-fit border border-border border-dashed rounded-lg p-3 flex-row items-center justify-between">
                    <View className="flex-row items-center">
                      <User color={colors.label} size={18} className="mr-1.5" />
                      <Text className="text-xl text-white">
                        {selectedEmployeeId
                          ? employees.find((e) => e.id === selectedEmployeeId)
                              ?.fullName
                          : "Select..."}
                      </Text>
                    </View>
                    <ChevronDown color={colors.label} size={18} />
                  </TouchableOpacity>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-72 bg-panel border-border">
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

            <View className="bg-panel border border-border rounded-xl p-4 mb-4">
              <Text className="text-xl font-semibold text-white mb-1.5">
                Items
              </Text>
              {/* 
                FIX: Use safe keyExtractor to prevent duplicate key errors 
                Combining item.inventoryItemId with index ensures uniqueness
            */}
              <FlatList
                data={expenseItems}
                scrollEnabled={false}
                keyExtractor={(item, index) =>
                  `${item.inventoryItemId}-${index}`
                }
                renderItem={({ item, index }) => (
                  <View className="flex-row items-center justify-between p-3 border-b border-border">
                    <View className="flex-1">
                      <Text className="text-xl text-white">
                        {item.itemName}
                      </Text>
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
                      <Trash2 color={colors.danger} size={20} />
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
                onPress={() => itemsSheetRef.current?.snapToIndex(1)}
                className="mt-3 py-2 border border-dashed rounded-lg items-center border-gray-500"
              >
                <Text className="text-lg font-semibold text-gray-300">
                  + Add Item
                </Text>
              </TouchableOpacity>
            </View>

            <View className="bg-panel border border-border rounded-xl p-4 mb-4">
              <Text className="text-lg font-medium text-gray-300 mb-1.5">
                Related PO (Optional)
              </Text>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <TouchableOpacity className="h-fit border border-border border-dashed rounded-lg p-3 flex-row items-center justify-between">
                    <Text className="text-xl text-white">
                      {selectedPOId
                        ? purchaseOrders.find((po) => po.id === selectedPOId)
                            ?.poNumber
                        : "Select..."}
                    </Text>
                    <ChevronDown color={colors.label} size={18} />
                  </TouchableOpacity>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-72 bg-panel border-border">
                  <DropdownMenuItem
                    onPress={() => setSelectedPOId(null)}
                    className="flex-row items-center p-2"
                  >
                    <Text className="text-white text-base font-medium">
                      None
                    </Text>
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

            <View className="bg-panel border border-border rounded-xl p-4 mb-4">
              <Text className="text-lg font-medium text-gray-300 mb-2">
                Store Info (Optional)
              </Text>
              <View className="gap-3">
                <View>
                  <Text className="text-white text-base mb-1.5">
                    Store Name
                  </Text>
                  <TextInput
                    value={storeName}
                    placeholderTextColor={colors.label}
                    onChangeText={setStoreName}
                    placeholder="e.g., Fresh Market"
                    className="text-white text-base bg-screen border border-border rounded-lg px-2 py-1.5 h-10"
                  />
                </View>
                <View>
                  <Text className="text-white text-base mb-1.5">Location</Text>
                  <TextInput
                    value={storeLocation}
                    onChangeText={setStoreLocation}
                    placeholder="e.g., 123 Main St"
                    className="text-white text-base bg-screen border border-border rounded-lg px-2 py-1.5 h-10"
                    placeholderTextColor={colors.label}
                  />
                </View>
              </View>
            </View>

            <View className="bg-panel border border-border rounded-xl p-4 mb-4">
              <Text className="text-lg font-medium text-gray-300 mb-1.5">
                Notes (Optional)
              </Text>
              <TextInput
                value={expenseNotes}
                onChangeText={setExpenseNotes}
                placeholderTextColor={colors.label}
                placeholder="e.g., Vendor delay"
                multiline
                className="text-white text-base bg-screen border border-border rounded-lg px-2 py-1.5 min-h-[80px]"
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <Dialog open={newItemModalOpen} onOpenChange={setNewItemModalOpen}>
          <DialogContent>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
              <ScrollView
                bounces={false}
                className="rounded-2xl h-fit p-4 w-[550px]"
                style={{
                  backgroundColor: colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
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
                    className="text-white text-base bg-panel border border-border rounded-lg px-2 py-1.5"
                  />
                  <Text className="text-gray-300 mt-2 text-sm">Unit</Text>
                  <TextInput
                    value={newItemUnit}
                    onChangeText={setNewItemUnit}
                    className="text-white text-base bg-panel border border-border rounded-lg px-2 py-1.5"
                  />
                  <Text className="text-gray-300 mt-2 text-sm">Cost/Unit</Text>
                  <TextInput
                    keyboardType="decimal-pad"
                    value={newItemCost}
                    onChangeText={setNewItemCost}
                    className="text-white text-base bg-panel border border-border rounded-lg px-2 py-1.5"
                  />
                  <Text className="text-gray-300 mt-2 text-sm">Stock Qty</Text>
                  <TextInput
                    keyboardType="number-pad"
                    value={newItemStock}
                    onChangeText={setNewItemStock}
                    className="text-white text-base bg-panel border border-border rounded-lg px-2 py-1.5"
                  />
                  <Text className="text-gray-300 mt-2 text-sm">Reorder</Text>
                  <TextInput
                    keyboardType="number-pad"
                    value={newItemReorder}
                    onChangeText={setNewItemReorder}
                    className="text-white text-base bg-panel border border-border rounded-lg px-2 py-1.5"
                  />
                  <Text className="text-gray-300 mt-2 text-sm">
                    Expense Qty
                  </Text>
                  <TextInput
                    keyboardType="number-pad"
                    value={newItemPOQty}
                    onChangeText={setNewItemPOQty}
                    className="text-white text-base bg-panel border border-border rounded-lg px-2 py-1.5"
                  />
                  <View className="flex-row gap-2 mt-3">
                    <TouchableOpacity
                      onPress={() => setNewItemModalOpen(false)}
                      className="flex-1 py-2 rounded-lg border border-border items-center"
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
            </KeyboardAvoidingView>
          </DialogContent>
        </Dialog>
      </View>
      <BottomSheet
        ref={itemsSheetRef}
        index={-1}
        snapPoints={snapPoints}
        {...bottomSheetTheme}
        topInset={60}
        enablePanDownToClose
        // 2. Add these props to handle keyboard interaction
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backdropComponent={(backdropProps) => (
          <BottomSheetBackdrop
            {...backdropProps}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.7}
          />
        )}
      >
        <View className="px-3 border-b border-border flex-row items-center justify-between">
          <Text className="text-white text-lg font-bold">Select Item</Text>
          <View className="mb-2 w-1/3 flex-row items-center gap-1.5 bg-screen border border-border rounded-lg px-2 py-1.5">
            <Search color={colors.label} size={16} />
            {/* 3. Replace TextInput with BottomSheetTextInput */}
            <BottomSheetTextInput
              value={itemSearch}
              onChangeText={setItemSearch}
              placeholder="Search..."
              className="text-white w-full text-sm h-full"
              placeholderTextColor={colors.heading}
              style={{ color: "white" }} // Explicit color often helps with BottomSheetTextInput
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
        <View className="px-3 py-2">
          {selectedInventoryItemId && (
            <View className="mb-3 p-2 rounded-lg border border-border bg-card">
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
                  {/* 4. Replace other TextInputs inside the sheet as well for consistent behavior */}
                  <BottomSheetTextInput
                    keyboardType="number-pad"
                    value={selectedQuantity}
                    onChangeText={setSelectedQuantity}
                    placeholder="1"
                    className="text-white text-base bg-screen border border-border rounded-lg px-2 py-1.5 h-10"
                    style={{ color: "white" }}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-white text-xs mb-1">Unit Price</Text>
                  <BottomSheetTextInput
                    keyboardType="decimal-pad"
                    value={selectedUnitPrice}
                    onChangeText={setSelectedUnitPrice}
                    placeholder="0.00"
                    className="text-white text-base bg-screen border border-border rounded-lg px-2 py-1.5 h-10"
                    style={{ color: "white" }}
                  />
                </View>
              </View>
              <View className="mb-2">
                <Text className="text-white text-xs mb-1">Notes</Text>
                <BottomSheetTextInput
                  value={itemNotes}
                  onChangeText={setItemNotes}
                  placeholder="e.g., Organic"
                  className="text-white text-base bg-screen border border-border rounded-lg px-2 py-1.5 h-10"
                  style={{ color: "white" }}
                  placeholderTextColor={colors.heading}
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
            keyExtractor={(i: any, index) => `${i.id}-${index}`}
            contentContainerStyle={{ paddingBottom: 60 }}
            renderItem={({ item }: { item: any }) => (
              <TouchableOpacity
                onPress={() => {
                  setSelectedInventoryItemId(item.id);
                  setSelectedUnitPrice(item.cost.toString());
                }}
                className="p-3 border-b border-border"
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
    </>
  );
};

export default CreateExternalExpenseScreen;
