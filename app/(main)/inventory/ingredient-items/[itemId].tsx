import { bottomSheetTheme, colors } from "@/lib/theme";
import { InventoryItem } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Edit,
  History,
  Minus,
  Plus,
  Save,
  X,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface InventoryTransaction {
  id: string;
  itemId: string;
  type:
    | "PO_RECEIPT"
    | "SALES_CONSUMPTION"
    | "SPOILAGE_WASTE"
    | "INTERNAL_TRANSFER"
    | "COUNT_CORRECTION"
    | "NOTE";
  quantityChange: number;
  resultingQuantity: number;
  reason: string;
  notes?: string;
  timestamp: string;
  userId: string;
  reference?: string;
}

const inputStyle = (editable: boolean) => ({
  backgroundColor: editable ? colors.screen : colors.card,
  borderWidth: 1,
  borderColor: editable ? colors.border : "transparent",
  borderRadius: 8,
  color: editable ? colors.heading : colors.label,
  fontSize: 13,
  height: 38,
  paddingHorizontal: 10,
});

const fieldLabel = {
  fontSize: 11,
  fontWeight: "600" as const,
  color: colors.muted,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  marginBottom: 6,
};

const transactionMeta = (type: string): { label: string; bg: string; text: string } => {
  switch (type) {
    case "PO_RECEIPT":        return { label: "PO Receipt",         bg: colors.success + "20", text: colors.success };
    case "SALES_CONSUMPTION": return { label: "Sales/Consumption",  bg: colors.info + "20",    text: colors.info };
    case "SPOILAGE_WASTE":    return { label: "Spoilage/Waste",     bg: colors.danger + "20",  text: colors.danger };
    case "INTERNAL_TRANSFER": return { label: "Internal Transfer",  bg: colors.warning + "20", text: colors.warning };
    case "COUNT_CORRECTION":  return { label: "Count Correction",   bg: colors.muted + "20",   text: colors.muted };
    case "NOTE":              return { label: "Note",               bg: colors.teal + "15",    text: colors.teal };
    default:                  return { label: type,                 bg: colors.muted + "20",   text: colors.muted };
  }
};

const REASON_OPTIONS = [
  { key: "SALES_CONSUMPTION", label: "Sales / Consumption" },
  { key: "SPOILAGE_WASTE",    label: "Spoilage / Waste" },
  { key: "INTERNAL_TRANSFER", label: "Internal Transfer" },
  { key: "COUNT_CORRECTION",  label: "Count Correction" },
  { key: "CUSTOM",            label: "Other (Custom)" },
];

const ADD_REASON_OPTIONS = [
  { key: "PO_RECEIPT",        label: "PO Receipt" },
  { key: "COUNT_CORRECTION",  label: "Count Correction" },
  { key: "INTERNAL_TRANSFER", label: "Internal Transfer" },
];

const IngredientItemScreen = () => {
  const { itemId } = useLocalSearchParams();
  const router = useRouter();
  const { inventoryItems, updateInventoryItem, vendors } = useInventoryStore();
  const [showError, setShowError] = useState({ title: "", description: "", show: false });
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editStockTrackingMode, setEditStockTrackingMode] = useState<"in_stock" | "out_of_stock" | "quantity">("in_stock");
  const [isLogUsageModalOpen, setIsLogUsageModalOpen] = useState(false);
  const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false);
  const [inventoryHistory, setInventoryHistory] = useState<InventoryTransaction[]>([]);

  const historySheetRef = React.useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["90%"], []);

  const [editForm, setEditForm] = useState({
    name: "", sku: "", category: "", defaultVendor: "",
    unitOfMeasure: "", stockQuantity: "", reorderThreshold: "", cost: "",
  });
  const [logUsageForm, setLogUsageForm] = useState({ quantityUsed: "", reason: "", customReason: "", notes: "" });
  const [addStockForm, setAddStockForm] = useState({ quantityAdded: "", reason: "", notes: "" });
  const [historyNote, setHistoryNote] = useState("");

  useEffect(() => {
    if (itemId && inventoryItems.length > 0) {
      const foundItem = inventoryItems.find((i) => i.id === itemId);
      if (foundItem) {
        setItem(foundItem);
        setEditForm({
          name: foundItem.name,
          sku: "",
          category: foundItem.category,
          defaultVendor: foundItem.vendorId || "",
          unitOfMeasure: foundItem.unit,
          stockQuantity: foundItem.stockQuantity?.toString() || "",
          reorderThreshold: foundItem.reorderThreshold?.toString() || "",
          cost: foundItem.cost?.toString() || "",
        });
        setEditStockTrackingMode((foundItem as any).stockTrackingMode || "in_stock");
        generateMockHistory(foundItem.id);
      }
    }
  }, [itemId, inventoryItems]);

  const generateMockHistory = (id: string) => {
    setInventoryHistory([
      { id: "1", itemId: id, type: "PO_RECEIPT",        quantityChange: 100, resultingQuantity: 100, reason: "Initial stock from purchase order", timestamp: "2024-01-10T09:00:00Z", userId: "user1", reference: "PO-2024-001" },
      { id: "2", itemId: id, type: "SALES_CONSUMPTION", quantityChange: -15, resultingQuantity: 85,  reason: "Used in menu item preparation",      notes: "Used in 15 menu items", timestamp: "2024-01-12T14:30:00Z", userId: "user2" },
      { id: "3", itemId: id, type: "SPOILAGE_WASTE",    quantityChange: -5,  resultingQuantity: 80,  reason: "Spoilage/Waste",                      notes: "Expired items removed",  timestamp: "2024-01-14T11:15:00Z", userId: "user1" },
      { id: "4", itemId: id, type: "COUNT_CORRECTION",  quantityChange: 3,   resultingQuantity: 83,  reason: "Count correction",                    notes: "Found additional units", timestamp: "2024-01-16T16:45:00Z", userId: "user3" },
    ]);
  };

  const handleSave = () => {
    if (!item) return;
    const roundedStockQuantity = editForm.stockQuantity !== "" ? Number(parseFloat(editForm.stockQuantity).toFixed(2)) : item.stockQuantity;
    const quantityFields = editStockTrackingMode === "quantity"
      ? { stockQuantity: roundedStockQuantity, reorderThreshold: editForm.reorderThreshold ? parseInt(editForm.reorderThreshold) : item.reorderThreshold }
      : { stockQuantity: undefined, reorderThreshold: undefined };
    const updatedItem = { ...item, name: editForm.name, category: editForm.category, vendorId: editForm.defaultVendor || null, unit: editForm.unitOfMeasure as any, ...(quantityFields as any), stockTrackingMode: editStockTrackingMode, cost: editForm.cost ? parseFloat(editForm.cost) : item.cost };
    updateInventoryItem(item.id, updatedItem);
    setItem(updatedItem);
    setIsEditing(false);
  };

  const handleLogUsage = () => {
    if (!item || !logUsageForm.quantityUsed || !logUsageForm.reason) return;
    if (editStockTrackingMode !== "quantity") {
      setShowError({ title: "This item is not set to track stock by quantity.", description: "Please set the stock tracking mode to quantity to log usage.", show: true });
      return;
    }
    const quantityChange = -parseFloat(logUsageForm.quantityUsed);
    const newQuantity = Number(((item.stockQuantity || 0) + quantityChange).toFixed(2));
    const newTransaction: InventoryTransaction = { id: Date.now().toString(), itemId: item.id, type: (logUsageForm.reason === "CUSTOM" ? "COUNT_CORRECTION" : logUsageForm.reason) as any, quantityChange, resultingQuantity: newQuantity, reason: logUsageForm.reason === "CUSTOM" && logUsageForm.customReason.trim() ? logUsageForm.customReason.trim() : logUsageForm.reason, notes: logUsageForm.notes, timestamp: new Date().toISOString(), userId: "current_user" };
    updateInventoryItem(item.id, { ...item, stockQuantity: newQuantity });
    setInventoryHistory((prev) => [newTransaction, ...prev]);
    setLogUsageForm({ quantityUsed: "", reason: "", customReason: "", notes: "" });
    setIsLogUsageModalOpen(false);
    setItem((prev) => (prev ? { ...prev, stockQuantity: newQuantity } : null));
  };

  const handleAddStock = () => {
    if (!item || !addStockForm.quantityAdded || !addStockForm.reason) return;
    if (editStockTrackingMode !== "quantity") return;
    const quantityChange = parseFloat(addStockForm.quantityAdded);
    const newQuantity = Number(((item.stockQuantity || 0) + quantityChange).toFixed(2));
    const newTransaction: InventoryTransaction = { id: Date.now().toString(), itemId: item.id, type: addStockForm.reason as any, quantityChange, resultingQuantity: newQuantity, reason: addStockForm.reason, notes: addStockForm.notes, timestamp: new Date().toISOString(), userId: "current_user" };
    updateInventoryItem(item.id, { ...item, stockQuantity: newQuantity });
    setInventoryHistory((prev) => [newTransaction, ...prev]);
    setAddStockForm({ quantityAdded: "", reason: "", notes: "" });
    setIsAddStockModalOpen(false);
    setItem((prev) => (prev ? { ...prev, stockQuantity: newQuantity } : null));
  };

  const getVendorName = (vendorId?: string | null) => {
    if (!vendorId) return "No vendor";
    const vendor = vendors.find((v) => v.id === vendorId);
    return vendor ? vendor.name : "Unknown vendor";
  };

  const renderBackdrop = useMemo(() => (props: any) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.7} />, []);

  const trackingMode = (item as any)?.stockTrackingMode || editStockTrackingMode;
  const isLowStock = item && item.stockQuantity !== undefined && item.reorderThreshold !== undefined && item.stockQuantity <= item.reorderThreshold;

  if (!item) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.screen }}>
        <Text style={{ fontSize: 13, color: colors.muted }}>Item not found</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>

        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.panel }}>
          <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ backgroundColor: colors.teal + "15", borderRadius: 8, padding: 6 }}>
              <ArrowLeft size={16} color={colors.teal} />
            </View>
            <Text style={{ fontSize: 13, color: colors.label }}>Back</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>{item.name}</Text>
          <TouchableOpacity
            onPress={isEditing ? handleSave : () => setIsEditing(true)}
            style={{
              flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6,
              backgroundColor: isEditing ? colors.success + "20" : colors.teal + "20",
              borderWidth: 1,
              borderColor: isEditing ? colors.success + "50" : colors.teal + "50",
              borderRadius: 8,
            }}
          >
            {isEditing ? <Save size={14} color={colors.success} /> : <Edit size={14} color={colors.teal} />}
            <Text style={{ fontSize: 12, fontWeight: "600", color: isEditing ? colors.success : colors.teal }}>
              {isEditing ? "Save" : "Edit"}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>

          {/* Overview Card */}
          <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>Overview</Text>
              {isLowStock
                ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><AlertTriangle size={13} color={colors.danger} /><Text style={{ fontSize: 11, color: colors.danger, fontWeight: "600" }}>Low Stock</Text></View>
                : <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><CheckCircle size={13} color={colors.success} /><Text style={{ fontSize: 11, color: colors.success, fontWeight: "600" }}>In Stock</Text></View>
              }
            </View>
            <View style={{ gap: 8 }}>
              {[
                { label: "Current Stock", value: trackingMode === "quantity" ? `${item.stockQuantity ?? 0} ${item.unit}` : trackingMode === "in_stock" ? "In Stock" : "Out of Stock", accent: trackingMode === "in_stock" ? colors.success : trackingMode === "out_of_stock" ? colors.danger : undefined },
                ...(trackingMode === "quantity" ? [{ label: "Reorder Threshold", value: `${item.reorderThreshold || "Not set"} ${item.unit}` }] : []),
                { label: "Cost per Unit", value: `$${item.cost?.toFixed(2) || "0.00"}` },
                { label: "Vendor", value: getVendorName(item.vendorId) },
                { label: "Category", value: item.category },
              ].map((row) => (
                <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontSize: 12, color: colors.label }}>{row.label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: (row as any).accent || colors.heading }}>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Quick Actions */}
          <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Quick Actions</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <TouchableOpacity
                onPress={() => setIsLogUsageModalOpen(true)}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, backgroundColor: colors.danger + "15", borderWidth: 1, borderColor: colors.danger + "30", borderRadius: 8 }}
              >
                <Minus size={14} color={colors.danger} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.danger }}>Log Usage</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setIsAddStockModalOpen(true)}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, backgroundColor: colors.success + "15", borderWidth: 1, borderColor: colors.success + "30", borderRadius: 8 }}
              >
                <Plus size={14} color={colors.success} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.success }}>Add Stock</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => historySheetRef.current?.expand()}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}
            >
              <History size={14} color={colors.label} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>View History</Text>
            </TouchableOpacity>
          </View>

          {/* Item Details Form */}
          <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Item Details</Text>
              {isEditing && (
                <TouchableOpacity onPress={() => setIsEditing(false)} style={{ flexDirection: "row", alignItems: "center", gap: 4, padding: 5 }}>
                  <X size={13} color={colors.muted} />
                  <Text style={{ fontSize: 11, color: colors.muted }}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Stock Tracking Mode */}
            <View style={{ marginBottom: 12 }}>
              <Text style={fieldLabel}>Stock Tracking</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {(["in_stock", "out_of_stock", "quantity"] as const).map((mode) => {
                  const isActive = editStockTrackingMode === mode;
                  const label = mode === "in_stock" ? "In Stock" : mode === "out_of_stock" ? "Out" : "Quantity";
                  return (
                    <TouchableOpacity
                      key={mode}
                      disabled={!isEditing}
                      onPress={() => setEditStockTrackingMode(mode)}
                      style={{ flex: 1, paddingVertical: 7, alignItems: "center", borderRadius: 8, borderWidth: 1, backgroundColor: isActive ? colors.teal + "20" : "transparent", borderColor: isActive ? colors.teal + "50" : colors.border }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "600", color: isActive ? colors.teal : colors.label }}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Fields 2-col */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Item Name</Text>
                <TextInput value={editForm.name} onChangeText={(t) => setEditForm((p) => ({ ...p, name: t }))} editable={isEditing} style={inputStyle(isEditing)} placeholder="Item name" placeholderTextColor={colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Category</Text>
                <TextInput value={editForm.category} onChangeText={(t) => setEditForm((p) => ({ ...p, category: t }))} editable={isEditing} style={inputStyle(isEditing)} placeholder="e.g., Produce" placeholderTextColor={colors.muted} />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Unit of Measure</Text>
                <TextInput value={editForm.unitOfMeasure} onChangeText={(t) => setEditForm((p) => ({ ...p, unitOfMeasure: t }))} editable={isEditing} style={inputStyle(isEditing)} placeholder="e.g., kg, pcs" placeholderTextColor={colors.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Cost per Unit ($)</Text>
                <TextInput value={editForm.cost} onChangeText={(t) => setEditForm((p) => ({ ...p, cost: t }))} editable={isEditing} keyboardType="numeric" style={inputStyle(isEditing)} placeholder="0.00" placeholderTextColor={colors.muted} />
              </View>
            </View>

            {editStockTrackingMode === "quantity" && (
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={fieldLabel}>Stock Quantity</Text>
                  <TextInput value={editForm.stockQuantity} onChangeText={(t) => setEditForm((p) => ({ ...p, stockQuantity: t.replace(/[^0-9.]/g, "") }))} editable={isEditing} keyboardType="numeric" style={inputStyle(isEditing)} placeholder="0" placeholderTextColor={colors.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={fieldLabel}>Reorder Threshold</Text>
                  <TextInput value={editForm.reorderThreshold} onChangeText={(t) => setEditForm((p) => ({ ...p, reorderThreshold: t.replace(/[^0-9.]/g, "") }))} editable={isEditing} keyboardType="numeric" style={inputStyle(isEditing)} placeholder="0" placeholderTextColor={colors.muted} />
                </View>
              </View>
            )}

            <View style={{ marginBottom: 4 }}>
              <Text style={fieldLabel}>SKU / Barcode</Text>
              <TextInput value={editForm.sku} onChangeText={(t) => setEditForm((p) => ({ ...p, sku: t }))} editable={isEditing} style={inputStyle(isEditing)} placeholder="Enter SKU or barcode" placeholderTextColor={colors.muted} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Log Usage Modal */}
      <Modal visible={isLogUsageModalOpen} transparent animationType="fade" onRequestClose={() => setIsLogUsageModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", paddingHorizontal: 16 }}>
            <View style={{ backgroundColor: colors.panel, borderRadius: 12, padding: 14, width: "100%", maxWidth: 480 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading, marginBottom: 2 }}>Log Usage</Text>
              <Text style={{ fontSize: 12, color: colors.label, marginBottom: 12 }}>{item.name}</Text>

              <View style={{ marginBottom: 10 }}>
                <Text style={fieldLabel}>Quantity Used</Text>
                <TextInput value={logUsageForm.quantityUsed} onChangeText={(t) => setLogUsageForm((p) => ({ ...p, quantityUsed: t }))} placeholder="Enter quantity" placeholderTextColor={colors.muted} keyboardType="numeric" style={{ ...inputStyle(true) }} />
              </View>

              <View style={{ marginBottom: 10 }}>
                <Text style={fieldLabel}>Reason</Text>
                <View style={{ gap: 4 }}>
                  {REASON_OPTIONS.map((opt) => {
                    const isActive = logUsageForm.reason === opt.key;
                    return (
                      <TouchableOpacity key={opt.key} onPress={() => setLogUsageForm((p) => ({ ...p, reason: opt.key }))}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: isActive ? colors.teal + "20" : "transparent", borderColor: isActive ? colors.teal + "50" : colors.border }}
                      >
                        <Text style={{ fontSize: 13, color: isActive ? colors.teal : colors.label, fontWeight: isActive ? "600" : "400" }}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {logUsageForm.reason === "CUSTOM" && (
                  <TextInput value={logUsageForm.customReason} onChangeText={(t) => setLogUsageForm((p) => ({ ...p, customReason: t }))} placeholder="Describe the reason..." placeholderTextColor={colors.muted} style={{ ...inputStyle(true), marginTop: 8 }} />
                )}
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={fieldLabel}>Notes (Optional)</Text>
                <TextInput value={logUsageForm.notes} onChangeText={(t) => setLogUsageForm((p) => ({ ...p, notes: t }))} placeholder="Additional details..." placeholderTextColor={colors.muted} multiline numberOfLines={2} style={{ ...inputStyle(true), height: 60, paddingTop: 8, textAlignVertical: "top" }} />
              </View>

              {showError.show && (
                <View style={{ backgroundColor: colors.danger + "15", borderWidth: 1, borderColor: colors.danger + "30", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, color: colors.danger }}>{showError.title}</Text>
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity onPress={() => setIsLogUsageModalOpen(false)} style={{ flex: 1, paddingVertical: 8, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: "center" }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.label }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleLogUsage} style={{ flex: 1, paddingVertical: 8, backgroundColor: colors.danger + "20", borderWidth: 1, borderColor: colors.danger + "30", borderRadius: 8, alignItems: "center" }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.danger }}>Log Usage</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Stock Modal */}
      <Modal visible={isAddStockModalOpen} transparent animationType="fade" onRequestClose={() => setIsAddStockModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", paddingHorizontal: 16 }}>
            <View style={{ backgroundColor: colors.panel, borderRadius: 12, padding: 14, width: "100%", maxWidth: 400 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading, marginBottom: 2 }}>Add Stock</Text>
              <Text style={{ fontSize: 12, color: colors.label, marginBottom: 12 }}>{item.name}</Text>

              <View style={{ marginBottom: 10 }}>
                <Text style={fieldLabel}>Quantity Added</Text>
                <TextInput value={addStockForm.quantityAdded} onChangeText={(t) => setAddStockForm((p) => ({ ...p, quantityAdded: t }))} placeholder="Enter quantity" placeholderTextColor={colors.muted} keyboardType="numeric" style={{ ...inputStyle(true) }} />
              </View>

              <View style={{ marginBottom: 10 }}>
                <Text style={fieldLabel}>Reason</Text>
                <View style={{ gap: 4 }}>
                  {ADD_REASON_OPTIONS.map((opt) => {
                    const isActive = addStockForm.reason === opt.key;
                    return (
                      <TouchableOpacity key={opt.key} onPress={() => setAddStockForm((p) => ({ ...p, reason: opt.key }))}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, backgroundColor: isActive ? colors.success + "20" : "transparent", borderColor: isActive ? colors.success + "50" : colors.border }}
                      >
                        <Text style={{ fontSize: 13, color: isActive ? colors.success : colors.label, fontWeight: isActive ? "600" : "400" }}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={fieldLabel}>Notes (Optional)</Text>
                <TextInput value={addStockForm.notes} onChangeText={(t) => setAddStockForm((p) => ({ ...p, notes: t }))} placeholder="Additional details..." placeholderTextColor={colors.muted} multiline numberOfLines={2} style={{ ...inputStyle(true), height: 60, paddingTop: 8, textAlignVertical: "top" }} />
              </View>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity onPress={() => setIsAddStockModalOpen(false)} style={{ flex: 1, paddingVertical: 8, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: 8, alignItems: "center" }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.label }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAddStock} style={{ flex: 1, paddingVertical: 8, backgroundColor: colors.success + "20", borderWidth: 1, borderColor: colors.success + "30", borderRadius: 8, alignItems: "center" }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.success }}>Add Stock</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* History Bottom Sheet */}
      <BottomSheet ref={historySheetRef} index={-1} snapPoints={snapPoints} enablePanDownToClose {...bottomSheetTheme} backdropComponent={renderBackdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={{ flex: 1 }}>
            {/* Sheet header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>Inventory History</Text>
              <TouchableOpacity onPress={() => historySheetRef.current?.close()} style={{ padding: 4 }}>
                <X size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>

            {/* Add Note */}
            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={fieldLabel}>Add Note</Text>
              <TextInput value={historyNote} onChangeText={setHistoryNote} placeholder="Type a note about this item..." placeholderTextColor={colors.muted} multiline numberOfLines={2} style={{ ...inputStyle(true), height: 56, paddingTop: 8, textAlignVertical: "top", marginBottom: 8 }} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity onPress={() => setHistoryNote("")} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (!item || !historyNote.trim()) return;
                    setInventoryHistory((prev) => [{ id: Date.now().toString(), itemId: item.id, type: "NOTE", quantityChange: 0, resultingQuantity: item.stockQuantity || 0, reason: "Note", notes: historyNote.trim(), timestamp: new Date().toISOString(), userId: "current_user" }, ...prev]);
                    setHistoryNote("");
                  }}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50", borderRadius: 8 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>Save Note</Text>
                </TouchableOpacity>
              </View>
            </View>

            {inventoryHistory.length === 0 ? (
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 8, padding: 20 }}>
                <History size={24} color={colors.muted} />
                <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}>No transaction history available</Text>
              </View>
            ) : (
              <BottomSheetFlatList
                data={inventoryHistory}
                keyExtractor={(t) => t.id}
                renderItem={({ item: transaction }) => {
                  const meta = transactionMeta(transaction.type);
                  return (
                    <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <View style={{ backgroundColor: meta.bg, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: meta.text }}>{meta.label}</Text>
                        </View>
                        <Text style={{ fontSize: 11, color: colors.muted }}>{new Date(transaction.timestamp).toLocaleDateString()}</Text>
                      </View>
                      {transaction.type !== "NOTE" && (
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: transaction.quantityChange > 0 ? colors.success : colors.danger }}>
                            {transaction.quantityChange > 0 ? "+" : ""}{transaction.quantityChange} {item.unit}
                          </Text>
                          <Text style={{ fontSize: 12, color: colors.label }}>Result: {transaction.resultingQuantity}</Text>
                        </View>
                      )}
                      {transaction.notes && <Text style={{ fontSize: 12, color: colors.label }}>{transaction.notes}</Text>}
                      {transaction.reference && <Text style={{ fontSize: 11, color: colors.teal, marginTop: 2 }}>Ref: {transaction.reference}</Text>}
                    </View>
                  );
                }}
                contentContainerStyle={{ paddingBottom: 20 }}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </BottomSheet>
    </View>
  );
};

export default IngredientItemScreen;
