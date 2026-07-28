import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/contexts/ToastContext";
import { useUiScale } from "@/lib/uiScale";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { ExternalExpenseLineItem } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from "@/components/ui/bottomSheet";
import { useRouter } from "expo-router";
import { ArrowLeft, ChevronDown, Plus, Search, Trash2, User } from "lucide-react-native";
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

const getFieldLabel = (s: (n: number) => number) => ({
  fontSize: s(11),
  fontWeight: "600" as const,
  color: colors.muted,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  marginBottom: s(5),
});

const getInputStyle = (s: (n: number) => number) => ({
  backgroundColor: colors.screen,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: s(8),
  color: colors.heading,
  fontSize: s(13),
  height: s(38),
  paddingHorizontal: s(12),
  paddingVertical: 0,
});

const CreateExternalExpenseScreen = () => {
  const router = useRouter();
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const fieldLabel = useMemo(() => getFieldLabel(s), [uiScale]);
  const inputStyle = useMemo(() => getInputStyle(s), [uiScale]);
  const { inventoryItems, addExternalExpense, purchaseOrders, addInventoryItem } = useInventoryStore();
  const { activeEmployeeId, employees } = useEmployeeStore();
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const { show } = useToast();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(activeEmployeeId);
  const [expenseItems, setExpenseItems] = useState<ExternalExpenseLineItem[]>([]);
  const [expenseNotes, setExpenseNotes] = useState("");
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storeLocation, setStoreLocation] = useState("");

  const itemsSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["50%", "85%"], []);

  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState("1");
  const [selectedUnitPrice, setSelectedUnitPrice] = useState("");
  const [itemNotes, setItemNotes] = useState("");
  const [itemSearch, setItemSearch] = useState("");

  const [newItemModalOpen, setNewItemModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("pcs");
  const [newItemCost, setNewItemCost] = useState("");
  const [newItemStock, setNewItemStock] = useState("");
  const [newItemReorder, setNewItemReorder] = useState("");
  const [newItemPOQty, setNewItemPOQty] = useState("1");

  useEffect(() => {
    if (activeEmployeeId && !selectedEmployeeId) setSelectedEmployeeId(activeEmployeeId);
  }, [activeEmployeeId, selectedEmployeeId]);

  const filteredInventoryItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return inventoryItems;
    return inventoryItems.filter((i) => i.name.toLowerCase().includes(q) || (i.unit ?? "").toString().toLowerCase().includes(q));
  }, [inventoryItems, itemSearch]);

  const totalAmount = expenseItems.reduce((s, i) => s + i.totalAmount, 0);

  const addSelectedItemToExpense = () => {
    if (!selectedInventoryItemId || !selectedQuantity || !selectedUnitPrice) {
      show({ title: "Missing Details", message: "Select an item and enter quantity and unit price.", type: "error" });
      return;
    }
    const qty = parseFloat(selectedQuantity);
    const price = parseFloat(selectedUnitPrice);
    if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
      show({ title: "Invalid Input", message: "Quantity and unit price must be greater than 0.", type: "error" });
      return;
    }
    const inv = inventoryItems.find((i) => i.id === selectedInventoryItemId);
    if (!inv) return;
    setExpenseItems((prev) => [...prev, {
      inventoryItemId: selectedInventoryItemId,
      itemName: inv.name,
      quantity: qty,
      unitPrice: price,
      totalAmount: qty * price,
      notes: itemNotes.trim() || undefined,
    }]);
    setSelectedInventoryItemId(null);
    setSelectedQuantity("1");
    setSelectedUnitPrice("");
    setItemNotes("");
    itemsSheetRef.current?.close();
    show({ title: "Item Added", message: `${inv.name} added to expense.`, type: "success" });
  };

  const handleCreateNewItem = () => {
    if (!newItemName.trim()) { show({ title: "Missing Name", message: "Enter a name for the new item.", type: "error" }); return; }
    const costNum = Number(newItemCost || 0);
    const poQty = Math.max(1, Number(newItemPOQty || 1));
    if (!selectedStore?.id) {
      show({ title: "No Store Selected", message: "Select a store before creating an inventory item.", type: "error" });
      return;
    }
    addInventoryItem({
      name: newItemName.trim(),
      category: "Uncategorized",
      stockQuantity: Math.max(0, Number(newItemStock || 0)),
      unit: newItemUnit as any,
      unitType: "unit",
      reorderThreshold: Math.max(0, Number(newItemReorder || 0)),
      cost: costNum,
      vendorId: "",
      locationId: selectedStore.id,
      stockTrackingMode: "quantity",
    }, selectedStore.id);
    const created = useInventoryStore.getState().inventoryItems[0];
    if (created) {
      setExpenseItems((prev) => [...prev, { inventoryItemId: created.id, itemName: created.name, quantity: poQty, unitPrice: costNum, totalAmount: poQty * costNum, notes: itemNotes.trim() || undefined }]);
    }
    setNewItemName(""); setNewItemUnit("pcs"); setNewItemCost(""); setNewItemStock(""); setNewItemReorder(""); setNewItemPOQty("1");
    setNewItemModalOpen(false);
    itemsSheetRef.current?.close();
    show({ title: "Item Created", message: `'${newItemName.trim()}' created and added.`, type: "success" });
  };

  const handleCreateExpense = async () => {
    if (expenseItems.length === 0) { show({ title: "Empty Expense", message: "Add at least one item.", type: "error" }); return; }
    if (!selectedEmployeeId) { show({ title: "No Employee", message: "Select the employee who made the purchase.", type: "error" }); return; }
    const emp = employees.find((e) => e.id === selectedEmployeeId);
    if (!emp) return;
    const relatedPO = selectedPOId ? purchaseOrders.find((po) => po.id === selectedPOId) : null;
    try {
      await addExternalExpense({
        totalAmount,
        purchasedByEmployeeId: selectedEmployeeId,
        purchasedByEmployeeName: emp.fullName,
        purchasedAt: new Date().toISOString(),
        items: expenseItems,
        notes: expenseNotes.trim() || undefined,
        relatedPOId: selectedPOId || undefined,
        relatedPONumber: relatedPO?.poNumber || undefined,
        storeName: storeName.trim() || undefined,
        storeLocation: storeLocation.trim() || undefined,
      });
      show({ title: "Expense Created", message: `Expense with ${expenseItems.length} items created.`, type: "success" });
      router.back();
    } catch {
      show({ title: "Create Failed", message: "Failed to create external expense.", type: "error" });
    }
  };

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  return (
    <>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: s(14) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: s(10) }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ flexDirection: "row", alignItems: "center", gap: s(5), paddingHorizontal: s(10), paddingVertical: s(6), backgroundColor: colors.teal + "15", borderWidth: 1, borderColor: colors.teal + "30", borderRadius: s(7) }}
            >
              <ArrowLeft size={s(13)} color={colors.teal} />
              <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.teal }}>Back</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: s(15), fontWeight: "700", color: colors.heading }}>Create External Expense</Text>
          </View>
          <TouchableOpacity
            onPress={handleCreateExpense}
            style={{ paddingHorizontal: s(12), paddingVertical: s(7), backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50", borderRadius: s(8) }}
          >
            <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.teal }}>Create Expense</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: s(12), paddingBottom: s(40) }} showsVerticalScrollIndicator={false}>

          {/* Employee + PO row */}
          <View style={{ flexDirection: "row", gap: s(12) }}>
            {/* Purchased By */}
            <View style={{ flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: s(12), padding: s(14) }}>
              <Text style={fieldLabel}>Purchased By</Text>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <TouchableOpacity
                    style={{ height: s(38), borderWidth: 1, borderColor: colors.border, borderRadius: s(8), paddingHorizontal: s(12), flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}>
                      <User size={s(13)} color={colors.muted} />
                      <Text style={{ fontSize: s(13), color: selectedEmployeeId ? colors.heading : colors.muted }}>
                        {selectedEmployee?.fullName || "Select employee..."}
                      </Text>
                    </View>
                    <ChevronDown size={s(14)} color={colors.muted} />
                  </TouchableOpacity>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" style={{ backgroundColor: colors.panel, borderColor: colors.border }}>
                  {employees.map((emp) => (
                    <DropdownMenuItem key={emp.id} onPress={() => setSelectedEmployeeId(emp.id)}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: s(8), flex: 1 }}>
                        <View style={{ width: s(26), height: s(26), borderRadius: s(13), backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "40", alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: s(10), fontWeight: "700", color: colors.teal }}>
                            {emp.fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: s(13), color: colors.heading }}>{emp.fullName}</Text>
                          <Text style={{ fontSize: s(11), color: colors.muted }}>{emp.shiftStatus === "clocked_in" ? "Clocked In" : "Clocked Out"}</Text>
                        </View>
                        {selectedEmployeeId === emp.id && <View style={{ width: s(6), height: s(6), borderRadius: s(3), backgroundColor: colors.teal }} />}
                      </View>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </View>

            {/* Related PO */}
            <View style={{ flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: s(12), padding: s(14) }}>
              <Text style={fieldLabel}>Related PO (Optional)</Text>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <TouchableOpacity
                    style={{ height: s(38), borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", borderRadius: s(8), paddingHorizontal: s(12), flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                  >
                    <Text style={{ fontSize: s(13), color: selectedPOId ? colors.heading : colors.muted }}>
                      {selectedPOId ? purchaseOrders.find((po) => po.id === selectedPOId)?.poNumber : "None"}
                    </Text>
                    <ChevronDown size={s(14)} color={colors.muted} />
                  </TouchableOpacity>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" style={{ backgroundColor: colors.panel, borderColor: colors.border }}>
                  <DropdownMenuItem onPress={() => setSelectedPOId(null)}>
                    <Text style={{ fontSize: s(13), color: colors.label }}>None</Text>
                    {!selectedPOId && <View style={{ width: s(6), height: s(6), borderRadius: s(3), backgroundColor: colors.teal, marginLeft: "auto" }} />}
                  </DropdownMenuItem>
                  {purchaseOrders.map((po) => (
                    <DropdownMenuItem key={po.id} onPress={() => setSelectedPOId(po.id)}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: s(13), color: colors.heading }}>{po.poNumber}</Text>
                        <Text style={{ fontSize: s(11), color: colors.muted }}>
                          {po.status} · ${po.items.reduce((sum, i) => sum + i.cost * i.quantity, 0).toFixed(2)}
                        </Text>
                      </View>
                      {selectedPOId === po.id && <View style={{ width: s(6), height: s(6), borderRadius: s(3), backgroundColor: colors.teal }} />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </View>
          </View>

          {/* Store info */}
          <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: s(12), padding: s(14) }}>
            <Text style={{ fontSize: s(11), fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: s(10) }}>Store Info (Optional)</Text>
            <View style={{ flexDirection: "row", gap: s(12) }}>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Store Name</Text>
                <TextInput
                  value={storeName}
                  onChangeText={setStoreName}
                  placeholder="e.g. Fresh Market"
                  placeholderTextColor={colors.muted}
                  style={inputStyle}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Location</Text>
                <TextInput
                  value={storeLocation}
                  onChangeText={setStoreLocation}
                  placeholder="e.g. 123 Main St"
                  placeholderTextColor={colors.muted}
                  style={inputStyle}
                />
              </View>
            </View>
          </View>

          {/* Items */}
          <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.screen, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Line Items ({expenseItems.length})
              </Text>
              {expenseItems.length > 0 && (
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.heading }}>
                  Total: ${totalAmount.toFixed(2)}
                </Text>
              )}
            </View>

            <FlatList
              data={expenseItems}
              scrollEnabled={false}
              keyExtractor={(item, index) => `${item.inventoryItemId}-${index}`}
              renderItem={({ item, index }) => (
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>{item.itemName}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                      {item.quantity} × ${item.unitPrice.toFixed(2)} = ${item.totalAmount.toFixed(2)}
                    </Text>
                    {item.notes && <Text style={{ fontSize: 11, color: colors.muted }}>{item.notes}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => setExpenseItems((prev) => prev.filter((_, i) => i !== index))} style={{ padding: 6 }}>
                    <Trash2 size={14} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingVertical: 20 }}>
                  <Text style={{ fontSize: 13, color: colors.muted }}>No items added yet</Text>
                </View>
              }
            />

            <TouchableOpacity
              onPress={() => itemsSheetRef.current?.snapToIndex(1)}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, margin: 10, paddingVertical: 9, borderWidth: 1, borderColor: colors.teal + "40", borderStyle: "dashed", borderRadius: 8 }}
            >
              <Plus size={13} color={colors.teal} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.teal }}>Add Item</Text>
            </TouchableOpacity>
          </View>

          {/* Notes */}
          <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 }}>
            <Text style={fieldLabel}>Notes (Optional)</Text>
            <TextInput
              value={expenseNotes}
              onChangeText={setExpenseNotes}
              placeholder="e.g. Vendor delay, special purchase..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              style={[inputStyle, { height: 72, paddingTop: 10, textAlignVertical: "top" }]}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Item Selection Sheet */}
      <BottomSheet
        ref={itemsSheetRef}
        index={-1}
        snapPoints={snapPoints}
        {...bottomSheetTheme}
        topInset={60}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.7} />
        )}
      >
        {/* Sheet header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>Select Item</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, height: 36, gap: 6 }}>
              <Search size={13} color={colors.muted} />
              <BottomSheetTextInput
                value={itemSearch}
                onChangeText={setItemSearch}
                placeholder="Search..."
                placeholderTextColor={colors.muted}
                style={{ fontSize: 13, color: colors.heading, width: 120, paddingVertical: 0, height: 36 }}
              />
            </View>
            <TouchableOpacity
              onPress={() => setNewItemModalOpen(true)}
              style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50", borderRadius: 8 }}
            >
              <Plus size={13} color={colors.teal} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>New Item</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selected item qty/price form */}
        {selectedInventoryItemId && (() => {
          const sel = inventoryItems.find((i) => i.id === selectedInventoryItemId);
          return (
            <View style={{ marginHorizontal: 12, marginTop: 10, marginBottom: 4, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.teal + "40", borderRadius: 10, padding: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading, marginBottom: 10 }}>
                {sel?.name} ({sel?.unit})
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={fieldLabel}>Quantity</Text>
                  <BottomSheetTextInput
                    keyboardType="number-pad"
                    value={selectedQuantity}
                    onChangeText={setSelectedQuantity}
                    placeholder="1"
                    placeholderTextColor={colors.muted}
                    style={{ height: 38, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.heading, fontSize: 13, paddingHorizontal: 12, paddingVertical: 0 }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={fieldLabel}>Unit Price ($)</Text>
                  <BottomSheetTextInput
                    keyboardType="decimal-pad"
                    value={selectedUnitPrice}
                    onChangeText={setSelectedUnitPrice}
                    placeholder="0.00"
                    placeholderTextColor={colors.muted}
                    style={{ height: 38, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.heading, fontSize: 13, paddingHorizontal: 12, paddingVertical: 0 }}
                  />
                </View>
              </View>
              <View style={{ marginBottom: 10 }}>
                <Text style={fieldLabel}>Notes (Optional)</Text>
                <BottomSheetTextInput
                  value={itemNotes}
                  onChangeText={setItemNotes}
                  placeholder="e.g. Organic"
                  placeholderTextColor={colors.muted}
                  style={{ height: 38, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.heading, fontSize: 13, paddingHorizontal: 12, paddingVertical: 0 }}
                />
              </View>
              <TouchableOpacity
                onPress={addSelectedItemToExpense}
                style={{ paddingVertical: 9, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50", borderRadius: 8, alignItems: "center" }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.teal }}>Add to Expense</Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        <BottomSheetFlatList
          data={filteredInventoryItems}
          keyExtractor={(i, idx) => `${i.id}-${idx}`}
          contentContainerStyle={{ paddingBottom: 60 }}
          renderItem={({ item: inv }) => {
            const isSelected = selectedInventoryItemId === inv.id;
            return (
              <TouchableOpacity
                onPress={() => { setSelectedInventoryItemId(inv.id); setSelectedUnitPrice(inv.cost.toString()); }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: isSelected ? colors.teal + "10" : "transparent",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: isSelected ? colors.teal : colors.heading }}>{inv.name}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
                    {inv.unit} | ${inv.cost.toFixed(2)} | Stock: {inv.stockQuantity}
                  </Text>
                </View>
                {isSelected && (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "40", borderRadius: 5 }}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>Selected</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 32 }}>
              <Text style={{ fontSize: 13, color: colors.muted }}>No items match.</Text>
            </View>
          }
        />
      </BottomSheet>

      {/* New Item Modal */}
      <Dialog open={newItemModalOpen} onOpenChange={setNewItemModalOpen}>
        <DialogContent>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <ScrollView
              bounces={false}
              style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 14, width: 500 }}
              contentContainerStyle={{ padding: 18 }}
            >
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading, marginBottom: 14 }}>Add Inventory Item</Text>
              <View style={{ gap: 10 }}>
                {[
                  { label: "Name *", value: newItemName, onChange: setNewItemName, placeholder: "Item name", keyboard: "default" as const },
                  { label: "Unit", value: newItemUnit, onChange: setNewItemUnit, placeholder: "e.g. pcs, kg", keyboard: "default" as const },
                ].map((f) => (
                  <View key={f.label}>
                    <Text style={fieldLabel}>{f.label}</Text>
                    <TextInput value={f.value} onChangeText={f.onChange} placeholder={f.placeholder} placeholderTextColor={colors.muted} style={inputStyle} />
                  </View>
                ))}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Cost / Unit</Text>
                    <TextInput value={newItemCost} onChangeText={setNewItemCost} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.muted} style={inputStyle} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Expense Qty</Text>
                    <TextInput value={newItemPOQty} onChangeText={setNewItemPOQty} keyboardType="number-pad" placeholder="1" placeholderTextColor={colors.muted} style={inputStyle} />
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Stock Qty</Text>
                    <TextInput value={newItemStock} onChangeText={setNewItemStock} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted} style={inputStyle} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Reorder Point</Text>
                    <TextInput value={newItemReorder} onChangeText={setNewItemReorder} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted} style={inputStyle} />
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={() => setNewItemModalOpen(false)}
                    style={{ flex: 1, paddingVertical: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.label }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreateNewItem}
                    style={{ flex: 1, paddingVertical: 9, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50", borderRadius: 8, alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.teal }}>Add Item</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CreateExternalExpenseScreen;
