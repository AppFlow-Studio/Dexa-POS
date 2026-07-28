import { bottomSheetTheme, colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { MenuItemType } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useMenuStore } from "@/stores/useMenuStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from "@/components/ui/bottomSheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Edit,
  History,
  Minus,
  Package,
  Plus,
  Save,
  Search,
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
    | "COUNT_CORRECTION";
  quantityChange: number;
  resultingQuantity: number;
  reason: string;
  notes?: string;
  timestamp: string;
  userId: string;
  reference?: string;
}

const inputStyle = (editable: boolean, s: (n: number) => number) => ({
  backgroundColor: editable ? colors.screen : colors.screen,
  borderWidth: 1,
  borderColor: editable ? colors.border : colors.border,
  borderRadius: s(8),
  color: editable ? colors.heading : colors.muted,
  fontSize: s(13),
  height: s(38),
  paddingHorizontal: s(12),
});

const fieldLabel = (s: (n: number) => number) => ({
  fontSize: s(11),
  fontWeight: "600" as const,
  color: colors.muted,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  marginBottom: s(5),
});

const transactionMeta = (
  type: string,
): { label: string; bg: string; text: string } => {
  switch (type) {
    case "PO_RECEIPT":
      return {
        label: "PO Receipt",
        bg: colors.success + "20",
        text: colors.success,
      };
    case "SALES_CONSUMPTION":
      return {
        label: "Sales/Consumption",
        bg: colors.teal + "20",
        text: colors.teal,
      };
    case "SPOILAGE_WASTE":
      return {
        label: "Spoilage/Waste",
        bg: colors.danger + "20",
        text: colors.danger,
      };
    case "INTERNAL_TRANSFER":
      return {
        label: "Internal Transfer",
        bg: colors.warning + "20",
        text: colors.warning,
      };
    case "COUNT_CORRECTION":
      return {
        label: "Count Correction",
        bg: colors.info + "20",
        text: colors.info,
      };
    default:
      return { label: type, bg: colors.muted + "20", text: colors.muted };
  }
};

const LOG_REASONS = [
  { key: "SALES_CONSUMPTION", label: "Sales / Consumption" },
  { key: "SPOILAGE_WASTE", label: "Spoilage / Waste" },
  { key: "INTERNAL_TRANSFER", label: "Internal Transfer" },
  { key: "COUNT_CORRECTION", label: "Count Correction" },
];

const MenuItemScreen = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const { itemId } = useLocalSearchParams();
  const router = useRouter();
  const {
    menuItems,
    updateMenuItem,
    getMenuItemStockTrackingMode,
    setMenuItemStockTrackingMode,
  } = useMenuStore();
  const { inventoryItems } = useInventoryStore();

  const [item, setItem] = useState<MenuItemType | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLogUsageModalOpen, setIsLogUsageModalOpen] = useState(false);
  const [inventoryHistory, setInventoryHistory] = useState<
    InventoryTransaction[]
  >([]);
  const [isEditingRecipe, setIsEditingRecipe] = useState(false);

  const historySheetRef = React.useRef<BottomSheet>(null);
  const inventorySelectionSheetRef = React.useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["90%"], []);
  const inventorySnapPoints = useMemo(() => ["70%"], []);

  const [editForm, setEditForm] = useState({
    name: "",
    sku: "",
    category: "",
    unitOfMeasure: "",
    stockQuantity: "",
    reorderThreshold: "",
    price: "",
  });

  const [editRecipeForm, setEditRecipeForm] = useState<
    { inventoryItemId: string; quantity: string }[]
  >([]);
  const [editStockTrackingMode, setEditStockTrackingMode] = useState<
    "in_stock" | "out_of_stock" | "quantity"
  >("in_stock");

  const [logUsageForm, setLogUsageForm] = useState({
    quantityUsed: "",
    reason: "",
    notes: "",
  });

  const [editingRecipeItemIndex, setEditingRecipeItemIndex] = useState<
    number | null
  >(null);
  const [inventorySearchQuery, setInventorySearchQuery] = useState("");

  const filteredInventoryItems = useMemo(() => {
    const q = inventorySearchQuery.trim().toLowerCase();
    if (!q) return inventoryItems;
    return inventoryItems.filter((i) => i.name.toLowerCase().includes(q));
  }, [inventorySearchQuery, inventoryItems]);

  useEffect(() => {
    if (itemId) {
      const foundItem = menuItems.find((m) => m.id === itemId);
      if (foundItem) {
        setItem(foundItem);
        setEditForm({
          name: foundItem.name,
          sku: "",
          category: Array.isArray(foundItem.category)
            ? foundItem.category.join(", ")
            : foundItem.category || "",
          unitOfMeasure: "",
          stockQuantity: foundItem.stockQuantity?.toString() || "",
          reorderThreshold: foundItem.reorderThreshold?.toString() || "",
          price: foundItem.price.toString(),
        });
        if (foundItem.recipe && foundItem.recipe.length > 0) {
          setEditRecipeForm(
            foundItem.recipe.map((r) => ({
              inventoryItemId: r.inventoryItemId,
              quantity: r.quantity.toString(),
            })),
          );
        } else {
          setEditRecipeForm([]);
        }
        const currentMode = getMenuItemStockTrackingMode(foundItem.id);
        setEditStockTrackingMode(currentMode);
        generateMockHistory(foundItem.id);
      }
    }
  }, []);

  const generateMockHistory = (id: string) => {
    setInventoryHistory([
      {
        id: "1",
        itemId: id,
        type: "PO_RECEIPT",
        quantityChange: 50,
        resultingQuantity: 50,
        reason: "Initial stock from purchase order",
        timestamp: "2024-01-15T10:30:00Z",
        userId: "user1",
        reference: "PO-2024-001",
      },
      {
        id: "2",
        itemId: id,
        type: "SALES_CONSUMPTION",
        quantityChange: -5,
        resultingQuantity: 45,
        reason: "Sales consumption",
        notes: "Used in 5 orders",
        timestamp: "2024-01-16T14:20:00Z",
        userId: "user2",
      },
      {
        id: "3",
        itemId: id,
        type: "COUNT_CORRECTION",
        quantityChange: 2,
        resultingQuantity: 47,
        reason: "Count correction",
        notes: "Found 2 additional units during inventory count",
        timestamp: "2024-01-17T09:15:00Z",
        userId: "user1",
      },
    ]);
  };

  const handleSave = () => {
    if (!item) return;
    const updatedItem = {
      ...item,
      name: editForm.name,
      category: editForm.category
        ? editForm.category.split(",").map((c) => c.trim())
        : [],
      price: parseFloat(editForm.price),
      stockTrackingMode: editStockTrackingMode,
    };
    const stockQuantity =
      editStockTrackingMode === "quantity" && editForm.stockQuantity
        ? Number(parseFloat(editForm.stockQuantity).toFixed(2))
        : undefined;
    const reorderThreshold =
      editStockTrackingMode === "quantity" && editForm.reorderThreshold
        ? parseInt(editForm.reorderThreshold)
        : undefined;
    setMenuItemStockTrackingMode(
      item.id,
      editStockTrackingMode,
      stockQuantity,
      reorderThreshold,
    );
    if (editRecipeForm.length > 0) {
      updatedItem.recipe = editRecipeForm
        .filter((r) => r.inventoryItemId && r.quantity)
        .map((r) => ({
          inventoryItemId: r.inventoryItemId,
          quantity: parseFloat(r.quantity) || 0,
        }));
    }
    updateMenuItem(item.id, updatedItem);
    const refreshed = menuItems.find((m) => m.id === item.id);
    if (refreshed) setItem(refreshed);
    setIsEditing(false);
  };

  const handleCancel = () => {
    if (!item) return;
    setEditForm({
      name: item.name,
      sku: "",
      category: Array.isArray(item.category)
        ? item.category.join(", ")
        : item.category || "",
      unitOfMeasure: "",
      stockQuantity: item.stockQuantity?.toString() || "",
      reorderThreshold: item.reorderThreshold?.toString() || "",
      price: item.price.toString(),
    });
    setEditStockTrackingMode(getMenuItemStockTrackingMode(item.id));
    setIsEditing(false);
  };

  const handleLogUsage = () => {
    if (!item || !logUsageForm.quantityUsed || !logUsageForm.reason) return;
    const quantityChange = -parseFloat(logUsageForm.quantityUsed);
    const newQuantity = Number(
      ((item.stockQuantity || 0) + quantityChange).toFixed(2),
    );
    const newTx: InventoryTransaction = {
      id: Date.now().toString(),
      itemId: item.id,
      type: logUsageForm.reason as any,
      quantityChange,
      resultingQuantity: newQuantity,
      reason: logUsageForm.reason,
      notes: logUsageForm.notes,
      timestamp: new Date().toISOString(),
      userId: "current_user",
    };
    updateMenuItem(item.id, { stockQuantity: newQuantity });
    setInventoryHistory((prev) => [newTx, ...prev]);
    setLogUsageForm({ quantityUsed: "", reason: "", notes: "" });
    setIsLogUsageModalOpen(false);
    setItem((prev) => (prev ? { ...prev, stockQuantity: newQuantity } : null));
  };

  const handleSaveRecipe = () => {
    if (!item) return;
    const recipe = editRecipeForm
      .filter((r) => r.inventoryItemId && r.quantity)
      .map((r) => ({
        inventoryItemId: r.inventoryItemId,
        quantity: parseFloat(r.quantity) || 0,
      }));
    const stockQuantity =
      editStockTrackingMode === "quantity" && editForm.stockQuantity
        ? parseInt(editForm.stockQuantity)
        : undefined;
    const reorderThreshold =
      editStockTrackingMode === "quantity" && editForm.reorderThreshold
        ? parseInt(editForm.reorderThreshold)
        : undefined;
    setMenuItemStockTrackingMode(
      item.id,
      editStockTrackingMode,
      stockQuantity,
      reorderThreshold,
    );
    updateMenuItem(item.id, { ...item, recipe });
    const refreshed = menuItems.find((m) => m.id === item.id);
    if (refreshed) setItem(refreshed);
    setIsEditingRecipe(false);
  };

  const handleCancelRecipe = () => {
    if (!item) return;
    if (item.recipe && item.recipe.length > 0) {
      setEditRecipeForm(
        item.recipe.map((r) => ({
          inventoryItemId: r.inventoryItemId,
          quantity: r.quantity.toString(),
        })),
      );
    } else {
      setEditRecipeForm([]);
    }
    setIsEditingRecipe(false);
  };

  const selectInventoryItem = (inventoryItemId: string) => {
    if (editingRecipeItemIndex !== null) {
      setEditRecipeForm((prev) =>
        prev.map((r, i) =>
          i === editingRecipeItemIndex
            ? { inventoryItemId, quantity: r.quantity }
            : r,
        ),
      );
      setEditingRecipeItemIndex(null);
      inventorySelectionSheetRef.current?.close();
      return;
    }
    if (editRecipeForm.some((r) => r.inventoryItemId === inventoryItemId)) {
      inventorySelectionSheetRef.current?.close();
      return;
    }
    setEditRecipeForm((prev) => [...prev, { inventoryItemId, quantity: "1" }]);
    inventorySelectionSheetRef.current?.close();
  };

  const getInventoryItemName = (id: string) =>
    inventoryItems.find((i) => i.id === id)?.name ?? "Unknown";
  const getInventoryItemUnit = (id: string) =>
    inventoryItems.find((i) => i.id === id)?.unit ?? "units";

  const renderBackdrop = useMemo(
    () => (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
      />
    ),
    [],
  );

  if (!item) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.screen,
        }}
      >
        <View
          style={{
            width: s(48),
            height: s(48),
            borderRadius: s(14),
            backgroundColor: colors.danger + "20",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: s(10),
          }}
        >
          <Package size={s(22)} color={colors.danger} />
        </View>
        <Text
          style={{
            fontSize: s(14),
            fontWeight: "700",
            color: colors.heading,
            marginBottom: s(4),
          }}
        >
          Item Not Found
        </Text>
        <Text style={{ fontSize: s(12), color: colors.muted, marginBottom: s(16) }}>
          This menu item doesn't exist or was removed.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(6),
            paddingHorizontal: s(14),
            paddingVertical: s(8),
            backgroundColor: colors.teal + "20",
            borderWidth: 1,
            borderColor: colors.teal + "50",
            borderRadius: s(8),
          }}
        >
          <ArrowLeft size={s(14)} color={colors.teal} />
          <Text style={{ fontSize: s(13), fontWeight: "600", color: colors.teal }}>
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isLowStock =
    item.stockTrackingMode === "quantity" &&
    item.stockQuantity !== undefined &&
    item.reorderThreshold !== undefined &&
    item.stockQuantity <= item.reorderThreshold;

  const stockTrackingModes: {
    key: "in_stock" | "out_of_stock" | "quantity";
    label: string;
  }[] = [
    { key: "in_stock", label: "In Stock" },
    { key: "out_of_stock", label: "Out of Stock" },
    { key: "quantity", label: "Track Qty" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: s(14),
          paddingVertical: s(10),
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.panel,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(6),
            paddingHorizontal: s(10),
            paddingVertical: s(6),
            backgroundColor: colors.teal + "15",
            borderWidth: 1,
            borderColor: colors.teal + "30",
            borderRadius: s(7),
          }}
        >
          <ArrowLeft size={s(14)} color={colors.teal} />
          <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.teal }}>
            Back
          </Text>
        </TouchableOpacity>

        <Text
          style={{ fontSize: s(14), fontWeight: "700", color: colors.heading }}
        >
          {item.name}
        </Text>

        <View style={{ flexDirection: "row", gap: s(8) }}>
          {isEditing ? (
            <>
              <TouchableOpacity
                onPress={handleCancel}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(5),
                  paddingHorizontal: s(10),
                  paddingVertical: s(6),
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: s(7),
                }}
              >
                <X size={s(13)} color={colors.label} />
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: "600",
                    color: colors.label,
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(5),
                  paddingHorizontal: s(10),
                  paddingVertical: s(6),
                  backgroundColor: colors.teal + "20",
                  borderWidth: 1,
                  borderColor: colors.teal + "50",
                  borderRadius: s(7),
                }}
              >
                <Save size={s(13)} color={colors.teal} />
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: "600",
                    color: colors.teal,
                  }}
                >
                  Save
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              onPress={() => setIsEditing(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s(5),
                paddingHorizontal: s(10),
                paddingVertical: s(6),
                backgroundColor: colors.teal + "15",
                borderWidth: 1,
                borderColor: colors.teal + "30",
                borderRadius: s(7),
              }}
            >
              <Edit size={s(13)} color={colors.teal} />
              <Text
                style={{ fontSize: s(12), fontWeight: "600", color: colors.teal }}
              >
                Edit
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: s(14), gap: s(12) }}
        >
          {/* Overview Card */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(12),
              padding: s(14),
            }}
          >
            <Text
              style={{
                fontSize: s(11),
                fontWeight: "700",
                color: colors.muted,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: s(10),
              }}
            >
              Overview
            </Text>
            <View style={{ gap: s(8) }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: s(12), color: colors.muted }}>
                  Current Stock
                </Text>
                <Text
                  style={{
                    fontSize: s(13),
                    fontWeight: "600",
                    color: colors.heading,
                  }}
                >
                  {item.stockTrackingMode === "quantity"
                    ? `${item.stockQuantity ?? 0} units`
                    : item.stockTrackingMode === "in_stock"
                      ? "In Stock"
                      : "Out of Stock"}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: s(12), color: colors.muted }}>
                  Reorder Threshold
                </Text>
                <Text
                  style={{
                    fontSize: s(13),
                    fontWeight: "600",
                    color: colors.heading,
                  }}
                >
                  {item.reorderThreshold ?? "—"}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: s(12), color: colors.muted }}>Price</Text>
                <Text
                  style={{
                    fontSize: s(13),
                    fontWeight: "600",
                    color: colors.heading,
                  }}
                >
                  ${item.price.toFixed(2)}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: s(12), color: colors.muted }}>
                  Availability
                </Text>
                <View
                  style={{
                    paddingHorizontal: s(8),
                    paddingVertical: s(3),
                    backgroundColor:
                      item.availability !== false
                        ? colors.success + "20"
                        : colors.danger + "20",
                    borderWidth: 1,
                    borderColor:
                      item.availability !== false
                        ? colors.success + "50"
                        : colors.danger + "50",
                    borderRadius: s(6),
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(11),
                      fontWeight: "600",
                      color:
                        item.availability !== false
                          ? colors.success
                          : colors.danger,
                    }}
                  >
                    {item.availability !== false ? "Available" : "Unavailable"}
                  </Text>
                </View>
              </View>
              {isLowStock && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: s(6),
                    backgroundColor: colors.warning + "15",
                    borderWidth: 1,
                    borderColor: colors.warning + "40",
                    borderRadius: s(8),
                    paddingHorizontal: s(10),
                    paddingVertical: s(7),
                    marginTop: s(2),
                  }}
                >
                  <AlertTriangle size={s(13)} color={colors.warning} />
                  <Text
                    style={{
                      fontSize: s(12),
                      color: colors.warning,
                      fontWeight: "600",
                    }}
                  >
                    Low Stock — reorder soon
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Quick Actions */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(12),
              padding: s(14),
            }}
          >
            <Text
              style={{
                fontSize: s(11),
                fontWeight: "700",
                color: colors.muted,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: s(10),
              }}
            >
              Quick Actions
            </Text>
            <View style={{ flexDirection: "row", gap: s(8) }}>
              <TouchableOpacity
                onPress={() => setIsLogUsageModalOpen(true)}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: s(6),
                  paddingVertical: s(8),
                  backgroundColor: colors.teal + "15",
                  borderWidth: 1,
                  borderColor: colors.teal + "40",
                  borderRadius: s(8),
                }}
              >
                <Minus size={s(14)} color={colors.teal} />
                <Text
                  style={{
                    fontSize: s(13),
                    fontWeight: "600",
                    color: colors.teal,
                  }}
                >
                  Log Usage
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => historySheetRef.current?.expand()}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: s(6),
                  paddingVertical: s(8),
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: s(8),
                }}
              >
                <History size={s(14)} color={colors.label} />
                <Text
                  style={{
                    fontSize: s(13),
                    fontWeight: "600",
                    color: colors.label,
                  }}
                >
                  View History
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Item Details */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(12),
              padding: s(14),
            }}
          >
            <Text
              style={{
                fontSize: s(11),
                fontWeight: "700",
                color: colors.muted,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: s(12),
              }}
            >
              Item Details
            </Text>

            {/* Stock Tracking Mode */}
            <View style={{ marginBottom: s(12) }}>
              <Text style={fieldLabel(s)}>Stock Tracking</Text>
              <View style={{ flexDirection: "row", gap: s(6) }}>
                {stockTrackingModes.map((mode) => {
                  const isActive = editStockTrackingMode === mode.key;
                  return (
                    <TouchableOpacity
                      key={mode.key}
                      disabled={!isEditing}
                      onPress={() => setEditStockTrackingMode(mode.key)}
                      style={{
                        flex: 1,
                        paddingVertical: s(7),
                        alignItems: "center",
                        borderRadius: s(7),
                        backgroundColor: isActive
                          ? colors.teal + "20"
                          : "transparent",
                        borderWidth: 1,
                        borderColor: isActive
                          ? colors.teal + "50"
                          : colors.border,
                        opacity: isEditing ? 1 : 0.7,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(12),
                          fontWeight: "600",
                          color: isActive ? colors.teal : colors.muted,
                        }}
                      >
                        {mode.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Name + SKU */}
            <View style={{ flexDirection: "row", gap: s(10), marginBottom: s(10) }}>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel(s)}>Item Name</Text>
                <TextInput
                  value={editForm.name}
                  onChangeText={(t) => setEditForm((p) => ({ ...p, name: t }))}
                  editable={isEditing}
                  placeholder="Item name"
                  placeholderTextColor={colors.muted}
                  style={inputStyle(isEditing, s)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel(s)}>SKU / Barcode</Text>
                <TextInput
                  value={editForm.sku}
                  onChangeText={(t) => setEditForm((p) => ({ ...p, sku: t }))}
                  editable={isEditing}
                  placeholder="e.g. SKU-0001"
                  placeholderTextColor={colors.muted}
                  style={inputStyle(isEditing, s)}
                />
              </View>
            </View>

            {/* Category + Unit */}
            <View style={{ flexDirection: "row", gap: s(10), marginBottom: s(10) }}>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel(s)}>Category</Text>
                <TextInput
                  value={editForm.category}
                  onChangeText={(t) =>
                    setEditForm((p) => ({ ...p, category: t }))
                  }
                  editable={isEditing}
                  placeholder="e.g. Appetizer, Main"
                  placeholderTextColor={colors.muted}
                  style={inputStyle(isEditing, s)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel(s)}>Unit of Measure</Text>
                <TextInput
                  value={editForm.unitOfMeasure}
                  onChangeText={(t) =>
                    setEditForm((p) => ({ ...p, unitOfMeasure: t }))
                  }
                  editable={isEditing}
                  placeholder="e.g. each, kg"
                  placeholderTextColor={colors.muted}
                  style={inputStyle(isEditing, s)}
                />
              </View>
            </View>

            {/* Price */}
            <View
              style={{
                marginBottom: editStockTrackingMode === "quantity" ? 10 : 0,
              }}
            >
              <Text style={fieldLabel(s)}>Price ($)</Text>
              <TextInput
                value={editForm.price}
                onChangeText={(t) => setEditForm((p) => ({ ...p, price: t }))}
                editable={isEditing}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                style={inputStyle(isEditing, s)}
              />
            </View>

            {/* Quantity fields (only when tracking mode = quantity) */}
            {editStockTrackingMode === "quantity" && (
              <View style={{ flexDirection: "row", gap: s(10), marginTop: s(10) }}>
                <View style={{ flex: 1 }}>
                  <Text style={fieldLabel(s)}>Stock Quantity</Text>
                  <TextInput
                    value={editForm.stockQuantity}
                    onChangeText={(t) =>
                      setEditForm((p) => ({
                        ...p,
                        stockQuantity: t.replace(/[^0-9.]/g, ""),
                      }))
                    }
                    editable={isEditing}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    style={inputStyle(isEditing, s)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={fieldLabel(s)}>Reorder Threshold</Text>
                  <TextInput
                    value={editForm.reorderThreshold}
                    onChangeText={(t) =>
                      setEditForm((p) => ({
                        ...p,
                        reorderThreshold: t.replace(/[^0-9]/g, ""),
                      }))
                    }
                    editable={isEditing}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    style={inputStyle(isEditing, s)}
                  />
                </View>
              </View>
            )}
          </View>

          {/* Recipe Section */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(12),
              padding: s(14),
              marginBottom: s(20),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: s(12),
              }}
            >
              <Text
                style={{
                  fontSize: s(11),
                  fontWeight: "700",
                  color: colors.muted,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Recipe / Ingredients
              </Text>
              {!isEditingRecipe ? (
                <TouchableOpacity
                  onPress={() => setIsEditingRecipe(true)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: s(5),
                    paddingHorizontal: s(10),
                    paddingVertical: s(6),
                    backgroundColor: colors.teal + "15",
                    borderWidth: 1,
                    borderColor: colors.teal + "30",
                    borderRadius: s(7),
                  }}
                >
                  <Edit size={s(12)} color={colors.teal} />
                  <Text
                    style={{
                      fontSize: s(12),
                      fontWeight: "600",
                      color: colors.teal,
                    }}
                  >
                    Edit Recipe
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: "row", gap: s(8) }}>
                  <TouchableOpacity
                    onPress={handleCancelRecipe}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(5),
                      paddingHorizontal: s(10),
                      paddingVertical: s(6),
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: s(7),
                    }}
                  >
                    <X size={s(12)} color={colors.label} />
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: "600",
                        color: colors.label,
                      }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveRecipe}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(5),
                      paddingHorizontal: s(10),
                      paddingVertical: s(6),
                      backgroundColor: colors.teal + "20",
                      borderWidth: 1,
                      borderColor: colors.teal + "50",
                      borderRadius: s(7),
                    }}
                  >
                    <Save size={s(12)} color={colors.teal} />
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: "600",
                        color: colors.teal,
                      }}
                    >
                      Save
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Recipe Items */}
            {(isEditingRecipe ? editRecipeForm : (item.recipe ?? [])).length ===
            0 ? (
              <View
                style={{ alignItems: "center", paddingVertical: s(20), gap: s(6) }}
              >
                <Text style={{ fontSize: s(13), color: colors.muted }}>
                  No ingredients linked yet
                </Text>
                {isEditingRecipe && (
                  <TouchableOpacity
                    onPress={() => {
                      setInventorySearchQuery("");
                      inventorySelectionSheetRef.current?.expand();
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(5),
                      paddingHorizontal: s(12),
                      paddingVertical: s(7),
                      backgroundColor: colors.teal + "15",
                      borderWidth: 1,
                      borderColor: colors.teal + "30",
                      borderRadius: s(7),
                      marginTop: s(4),
                    }}
                  >
                    <Plus size={s(13)} color={colors.teal} />
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: "600",
                        color: colors.teal,
                      }}
                    >
                      Add Ingredient
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={{ gap: s(6) }}>
                {(isEditingRecipe ? editRecipeForm : (item.recipe ?? [])).map(
                  (r: any, index: number) => (
                    <View
                      key={index}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: colors.screen,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: s(8),
                        paddingHorizontal: s(10),
                        paddingVertical: s(8),
                        gap: s(10),
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: s(13),
                            fontWeight: "600",
                            color: colors.heading,
                          }}
                        >
                          {getInventoryItemName(r.inventoryItemId)}
                        </Text>
                        <Text style={{ fontSize: s(11), color: colors.muted }}>
                          {getInventoryItemUnit(r.inventoryItemId)}
                        </Text>
                      </View>
                      {isEditingRecipe ? (
                        <>
                          <TextInput
                            value={
                              "quantity" in r
                                ? r.quantity
                                : r.quantity.toString()
                            }
                            onChangeText={(t) => {
                              setEditRecipeForm((prev) =>
                                prev.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        quantity: t.replace(/[^0-9.]/g, ""),
                                      }
                                    : item,
                                ),
                              );
                            }}
                            keyboardType="numeric"
                            style={{
                              width: s(60),
                              height: s(38),
                              backgroundColor: colors.panel,
                              borderWidth: 1,
                              borderColor: colors.border,
                              borderRadius: s(6),
                              color: colors.heading,
                              fontSize: s(13),
                              textAlign: "center",
                              paddingVertical: s(0),
                            }}
                          />
                          <TouchableOpacity
                            onPress={() => {
                              setEditingRecipeItemIndex(index);
                              setInventorySearchQuery("");
                              inventorySelectionSheetRef.current?.expand();
                            }}
                            style={{ padding: s(5) }}
                          >
                            <Search size={s(14)} color={colors.muted} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() =>
                              setEditRecipeForm((prev) =>
                                prev.filter((_, i) => i !== index),
                              )
                            }
                            style={{ padding: s(5) }}
                          >
                            <X size={s(14)} color={colors.danger} />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <Text
                          style={{
                            fontSize: s(13),
                            fontWeight: "600",
                            color: colors.heading,
                          }}
                        >
                          ×{"quantity" in r ? r.quantity : (r as any).quantity}
                        </Text>
                      )}
                    </View>
                  ),
                )}
                {isEditingRecipe && (
                  <TouchableOpacity
                    onPress={() => {
                      setInventorySearchQuery("");
                      inventorySelectionSheetRef.current?.expand();
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: s(6),
                      paddingVertical: s(8),
                      borderWidth: 1,
                      borderColor: colors.teal + "40",
                      borderRadius: s(8),
                      borderStyle: "dashed",
                    }}
                  >
                    <Plus size={s(13)} color={colors.teal} />
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: "600",
                        color: colors.teal,
                      }}
                    >
                      Add Ingredient
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Log Usage Modal */}
      <Modal
        visible={isLogUsageModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsLogUsageModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.6)",
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: s(24),
            }}
          >
            <View
              style={{
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: s(14),
                padding: s(18),
                width: "100%",
                maxWidth: 440,
                gap: s(12),
              }}
            >
              <Text
                style={{
                  fontSize: s(15),
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                Log Usage — {item.name}
              </Text>

              {/* Quantity */}
              <View>
                <Text style={fieldLabel(s)}>Quantity Used</Text>
                <TextInput
                  value={logUsageForm.quantityUsed}
                  onChangeText={(t) =>
                    setLogUsageForm((p) => ({ ...p, quantityUsed: t }))
                  }
                  placeholder="Enter quantity"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  style={inputStyle(true, s)}
                />
              </View>

              {/* Reason pills */}
              <View>
                <Text style={fieldLabel(s)}>Reason</Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: s(6) }}
                >
                  {LOG_REASONS.map((r) => {
                    const isActive = logUsageForm.reason === r.key;
                    return (
                      <TouchableOpacity
                        key={r.key}
                        onPress={() =>
                          setLogUsageForm((p) => ({ ...p, reason: r.key }))
                        }
                        style={{
                          paddingHorizontal: s(10),
                          paddingVertical: s(6),
                          borderRadius: s(7),
                          backgroundColor: isActive
                            ? colors.teal + "20"
                            : "transparent",
                          borderWidth: 1,
                          borderColor: isActive
                            ? colors.teal + "50"
                            : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: s(12),
                            fontWeight: "600",
                            color: isActive ? colors.teal : colors.muted,
                          }}
                        >
                          {r.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Notes */}
              <View>
                <Text style={fieldLabel(s)}>Notes (Optional)</Text>
                <TextInput
                  value={logUsageForm.notes}
                  onChangeText={(t) =>
                    setLogUsageForm((p) => ({ ...p, notes: t }))
                  }
                  placeholder="Additional details..."
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={3}
                  style={[
                    inputStyle(true, s),
                    { height: s(70), paddingTop: 10, textAlignVertical: "top" },
                  ]}
                />
              </View>

              {/* Buttons */}
              <View style={{ flexDirection: "row", gap: s(8) }}>
                <TouchableOpacity
                  onPress={() => setIsLogUsageModalOpen(false)}
                  style={{
                    flex: 1,
                    paddingVertical: s(9),
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: s(8),
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(13),
                      fontWeight: "600",
                      color: colors.label,
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleLogUsage}
                  style={{
                    flex: 1,
                    paddingVertical: s(9),
                    backgroundColor: colors.teal + "20",
                    borderWidth: 1,
                    borderColor: colors.teal + "50",
                    borderRadius: s(8),
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(13),
                      fontWeight: "600",
                      color: colors.teal,
                    }}
                  >
                    Log Usage
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* History Bottom Sheet */}
      <BottomSheet
        ref={historySheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        {...bottomSheetTheme}
        backdropComponent={renderBackdrop}
      >
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: s(14),
              paddingVertical: s(10),
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{ fontSize: s(14), fontWeight: "700", color: colors.heading }}
            >
              Inventory History
            </Text>
            <TouchableOpacity onPress={() => historySheetRef.current?.close()}>
              <X size={s(18)} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <BottomSheetFlatList
            data={inventoryHistory}
            keyExtractor={(tx) => tx.id}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item: tx }) => {
              const meta = transactionMeta(tx.type);
              const isPositive = tx.quantityChange > 0;
              return (
                <View
                  style={{
                    paddingHorizontal: s(14),
                    paddingVertical: s(10),
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: s(4),
                    }}
                  >
                    <View
                      style={{
                        paddingHorizontal: s(8),
                        paddingVertical: s(3),
                        backgroundColor: meta.bg,
                        borderRadius: s(5),
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(11),
                          fontWeight: "600",
                          color: meta.text,
                        }}
                      >
                        {meta.label}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: s(13),
                        fontWeight: "700",
                        color: isPositive ? colors.success : colors.danger,
                      }}
                    >
                      {isPositive ? "+" : ""}
                      {tx.quantityChange}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={{ fontSize: s(12), color: colors.muted }}>
                      {new Date(tx.timestamp).toLocaleDateString()} · Resulting:{" "}
                      {tx.resultingQuantity}
                    </Text>
                    {tx.reference && (
                      <Text style={{ fontSize: s(11), color: colors.muted }}>
                        {tx.reference}
                      </Text>
                    )}
                  </View>
                  {tx.notes && (
                    <Text
                      style={{
                        fontSize: s(11),
                        color: colors.muted,
                        marginTop: s(3),
                      }}
                    >
                      {tx.notes}
                    </Text>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={{ alignItems: "center", paddingVertical: s(40) }}>
                <Text style={{ fontSize: s(13), color: colors.muted }}>
                  No history recorded yet
                </Text>
              </View>
            }
          />
        </View>
      </BottomSheet>

      {/* Inventory Selection Bottom Sheet */}
      <BottomSheet
        ref={inventorySelectionSheetRef}
        index={-1}
        snapPoints={inventorySnapPoints}
        enablePanDownToClose
        {...bottomSheetTheme}
        backdropComponent={renderBackdrop}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: s(14),
                paddingVertical: s(10),
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: s(14),
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                {editingRecipeItemIndex !== null
                  ? "Replace Ingredient"
                  : "Add Ingredient"}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setEditingRecipeItemIndex(null);
                  inventorySelectionSheetRef.current?.close();
                }}
              >
                <X size={s(18)} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <View
              style={{
                padding: s(12),
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: s(8),
                  paddingHorizontal: s(10),
                  height: s(38),
                  gap: s(8),
                }}
              >
                <Search size={s(14)} color={colors.muted} />
                <TextInput
                  value={inventorySearchQuery}
                  onChangeText={setInventorySearchQuery}
                  placeholder="Search ingredients..."
                  placeholderTextColor={colors.muted}
                  style={{
                    flex: 1,
                    fontSize: s(13),
                    color: colors.heading,
                    paddingVertical: s(0),
                  }}
                />
              </View>
            </View>
            <BottomSheetFlatList
              data={filteredInventoryItems}
              keyExtractor={(i) => i.id}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item: inv }) => {
                const isAlreadyAdded = editRecipeForm.some(
                  (r) => r.inventoryItemId === inv.id,
                );
                const isCurrentlySelected =
                  editingRecipeItemIndex !== null &&
                  editRecipeForm[editingRecipeItemIndex]?.inventoryItemId ===
                    inv.id;
                return (
                  <TouchableOpacity
                    onPress={() => selectInventoryItem(inv.id)}
                    disabled={isAlreadyAdded && !isCurrentlySelected}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: s(14),
                      paddingVertical: s(10),
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                      opacity:
                        isAlreadyAdded && !isCurrentlySelected ? 0.45 : 1,
                      backgroundColor: isCurrentlySelected
                        ? colors.teal + "10"
                        : "transparent",
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: s(13),
                          fontWeight: "600",
                          color: colors.heading,
                        }}
                      >
                        {inv.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: s(11),
                          color: colors.muted,
                          marginTop: s(1),
                        }}
                      >
                        {inv.stockQuantity} {inv.unit} · ${inv.cost.toFixed(2)}
                      </Text>
                    </View>
                    {isCurrentlySelected ? (
                      <View
                        style={{
                          paddingHorizontal: s(8),
                          paddingVertical: s(3),
                          backgroundColor: colors.teal + "20",
                          borderWidth: 1,
                          borderColor: colors.teal + "40",
                          borderRadius: s(5),
                        }}
                      >
                        <Text
                          style={{
                            fontSize: s(11),
                            fontWeight: "600",
                            color: colors.teal,
                          }}
                        >
                          Selected
                        </Text>
                      </View>
                    ) : isAlreadyAdded ? (
                      <View
                        style={{
                          paddingHorizontal: s(8),
                          paddingVertical: s(3),
                          backgroundColor: colors.muted + "20",
                          borderRadius: s(5),
                        }}
                      >
                        <Text style={{ fontSize: s(11), color: colors.muted }}>
                          Added
                        </Text>
                      </View>
                    ) : (
                      <CheckCircle size={s(16)} color={colors.border} />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingVertical: s(40) }}>
                  <Text style={{ fontSize: s(13), color: colors.muted }}>
                    {inventorySearchQuery
                      ? "No items found"
                      : "No inventory items available"}
                  </Text>
                </View>
              }
            />
          </View>
        </KeyboardAvoidingView>
      </BottomSheet>
    </View>
  );
};

export default MenuItemScreen;
