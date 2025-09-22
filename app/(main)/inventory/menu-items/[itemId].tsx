import { MenuItemType } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useMenuStore } from "@/stores/useMenuStore";
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
  Search,
  X,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
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

const MenuItemScreen = () => {
  const { itemId } = useLocalSearchParams();
  const router = useRouter();
  const {
    menuItems,
    updateMenuItem,
    getMenuItemStockTrackingMode,
    setMenuItemStockTrackingMode,
  } = useMenuStore();
  const { vendors, inventoryItems } = useInventoryStore();

  const [item, setItem] = useState<MenuItemType | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLogUsageModalOpen, setIsLogUsageModalOpen] = useState(false);
  const [inventoryHistory, setInventoryHistory] = useState<
    InventoryTransaction[]
  >([]);
  const [isEditingRecipe, setIsEditingRecipe] = useState(false);

  // Bottom sheet refs
  const historySheetRef = React.useRef<BottomSheet>(null);
  const inventorySelectionSheetRef = React.useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["90%"], []);
  const inventorySnapPoints = useMemo(() => ["70%"], []);

  // Edit form state (temporary state for editing)
  const [editForm, setEditForm] = useState({
    name: "",
    sku: "",
    category: "",
    defaultVendor: "",
    unitOfMeasure: "",
    stockQuantity: "10",
    reorderThreshold: "5",
    price: "",
    stockTrackingMode: "",
  });

  // Recipe editing form state (temporary state for editing)
  const [editRecipeForm, setEditRecipeForm] = useState<
    { inventoryItemId: string; quantity: string }[]
  >([]);
  const [editStockTrackingMode, setEditStockTrackingMode] = useState<
    "in_stock" | "out_of_stock" | "quantity"
  >("in_stock");

  // Log usage form state
  const [logUsageForm, setLogUsageForm] = useState({
    quantityUsed: "",
    reason: "",
    notes: "",
  });

  // Recipe editing state
  const [editingRecipeItemIndex, setEditingRecipeItemIndex] = useState<
    number | null
  >(null);

  // Inventory selection state
  const [inventorySearchQuery, setInventorySearchQuery] = useState("");
  const [filteredInventoryItems, setFilteredInventoryItems] =
    useState(inventoryItems);

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
          defaultVendor: "",
          unitOfMeasure: "",
          stockQuantity: foundItem.stockQuantity?.toString() || "",
          reorderThreshold: foundItem.reorderThreshold?.toString() || "",
          price: foundItem.price.toString(),
          stockTrackingMode: foundItem.stockTrackingMode || "in-stock",
        });

        // Initialize edit recipe form
        if (foundItem.recipe && foundItem.recipe.length > 0) {
          setEditRecipeForm(
            foundItem.recipe.map((recipeItem) => ({
              inventoryItemId: recipeItem.inventoryItemId,
              quantity: recipeItem.quantity.toString(),
            }))
          );
        } else {
          setEditRecipeForm([]);
        }

        // Initialize edit stock tracking mode using store function
        const currentMode = getMenuItemStockTrackingMode(foundItem.id);
        setEditStockTrackingMode(currentMode);

        generateMockHistory(foundItem.id);
      }
    }
  }, []);

  // Filter inventory items based on search query
  useEffect(() => {
    if (inventorySearchQuery.trim() === "") {
      setFilteredInventoryItems(inventoryItems);
    } else {
      const filtered = inventoryItems.filter((item) =>
        item.name.toLowerCase().includes(inventorySearchQuery.toLowerCase())
      );
      setFilteredInventoryItems(filtered);
    }
  }, [inventorySearchQuery, inventoryItems]);

  const generateMockHistory = (id: string) => {
    const mockHistory: InventoryTransaction[] = [
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
    ];
    setInventoryHistory(mockHistory);
  };

  const handleSave = () => {
    if (!item) return;

    // Update basic item properties
    const roundedStockQuantity =
      editForm.stockQuantity !== ""
        ? Number(parseFloat(editForm.stockQuantity).toFixed(2))
        : item.stockQuantity;
    const updatedItem = {
      ...item,
      name: editForm.name,
      category: editForm.category
        ? editForm.category.split(",").map((c) => c.trim())
        : [],
      price: parseFloat(editForm.price),
      stockTrackingMode: editStockTrackingMode,
    };

    // Update stock tracking mode using store function
    const stockQuantity =
      editForm.stockTrackingMode === "quantity"
        ? editForm.stockQuantity
          ? Number(parseFloat(editForm.stockQuantity).toFixed(2))
          : undefined
        : undefined;
    const reorderThreshold =
      editStockTrackingMode === "quantity"
        ? editForm.reorderThreshold
          ? parseInt(editForm.reorderThreshold)
          : undefined
        : undefined;

    setMenuItemStockTrackingMode(
      item.id,
      editStockTrackingMode,
      stockQuantity,
      reorderThreshold
    );

    // Save recipe if it exists
    if (editRecipeForm.length > 0) {
      const recipe = editRecipeForm
        .filter(
          (recipeItem) => recipeItem.inventoryItemId && recipeItem.quantity
        )
        .map((recipeItem) => ({
          inventoryItemId: recipeItem.inventoryItemId,
          quantity: parseFloat(recipeItem.quantity) || 0,
        }));
      updatedItem.recipe = recipe;
    }

    updateMenuItem(item.id, updatedItem);

    // Refresh the item state to reflect changes
    const refreshedItem = menuItems.find((m) => m.id === item.id);
    if (refreshedItem) {
      setItem(refreshedItem);
    }

    setIsEditing(false);
  };

  const handleLogUsage = () => {
    if (!item || !logUsageForm.quantityUsed || !logUsageForm.reason) return;

    const quantityChange = -parseFloat(logUsageForm.quantityUsed);
    const newQuantity = Number(
      ((item.stockQuantity || 0) + quantityChange).toFixed(2)
    );

    const newTransaction: InventoryTransaction = {
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
    setInventoryHistory((prev) => [newTransaction, ...prev]);
    setLogUsageForm({ quantityUsed: "", reason: "", notes: "" });
    setIsLogUsageModalOpen(false);
    setItem((prev) => (prev ? { ...prev, stockQuantity: newQuantity } : null));
  };

  const getTransactionTypeLabel = (type: string) => {
    switch (type) {
      case "PO_RECEIPT":
        return "PO Receipt";
      case "SALES_CONSUMPTION":
        return "Sales/Consumption";
      case "SPOILAGE_WASTE":
        return "Spoilage/Waste";
      case "INTERNAL_TRANSFER":
        return "Internal Transfer";
      case "COUNT_CORRECTION":
        return "Count Correction";
      default:
        return type;
    }
  };

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case "PO_RECEIPT":
        return "bg-green-600";
      case "SALES_CONSUMPTION":
        return "bg-blue-600";
      case "SPOILAGE_WASTE":
        return "bg-red-600";
      case "INTERNAL_TRANSFER":
        return "bg-yellow-600";
      case "COUNT_CORRECTION":
        return "bg-purple-600";
      default:
        return "bg-gray-600";
    }
  };

  const renderBackdrop = useMemo(
    () => (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
      />
    ),
    []
  );

  const renderInventoryBackdrop = useMemo(
    () => (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
      />
    ),
    []
  );

  // Recipe helper functions
  const getInventoryItemName = (inventoryItemId: string) => {
    const inventoryItem = inventoryItems.find(
      (item) => item.id === inventoryItemId
    );
    return inventoryItem ? inventoryItem.name : "Unknown Item";
  };

  const getInventoryItemUnit = (inventoryItemId: string) => {
    const inventoryItem = inventoryItems.find(
      (item) => item.id === inventoryItemId
    );
    return inventoryItem ? inventoryItem.unit : "units";
  };

  const openInventorySelection = () => {
    setInventorySearchQuery("");
    inventorySelectionSheetRef.current?.expand();
  };

  const selectInventoryItem = (inventoryItemId: string) => {
    // If we're editing an existing recipe item, replace it
    if (editingRecipeItemIndex !== null) {
      setEditRecipeForm((prev) =>
        prev.map((item, index) =>
          index === editingRecipeItemIndex
            ? { inventoryItemId, quantity: item.quantity } // Keep existing quantity
            : item
        )
      );
      setEditingRecipeItemIndex(null);
      inventorySelectionSheetRef.current?.close();
      return;
    }

    // Check if item is already in recipe (for new items)
    const existingIndex = editRecipeForm.findIndex(
      (item) => item.inventoryItemId === inventoryItemId
    );
    if (existingIndex >= 0) {
      // Item already exists, just close the sheet
      inventorySelectionSheetRef.current?.close();
      return;
    }

    // Add new item to recipe
    setEditRecipeForm((prev) => [...prev, { inventoryItemId, quantity: "1" }]);
    inventorySelectionSheetRef.current?.close();
  };

  const removeRecipeItem = (index: number) => {
    setEditRecipeForm((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRecipeItemQuantity = (index: number, quantity: string) => {
    setEditRecipeForm((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity } : item))
    );
  };

  const handleCancel = () => {
    if (!item) return;

    // Reset edit form to original item values
    setEditForm({
      name: item.name,
      sku: "",
      category: Array.isArray(item.category)
        ? item.category.join(", ")
        : item.category || "",
      defaultVendor: "",
      unitOfMeasure: "",
      stockQuantity: item.stockQuantity?.toString() || "",
      reorderThreshold: item.reorderThreshold?.toString() || "",
      price: item.price.toString(),
      stockTrackingMode: item.stockTrackingMode || "in_stock",
    });

    // Reset stock tracking mode to original value
    const currentMode = getMenuItemStockTrackingMode(item.id);
    setEditStockTrackingMode(currentMode);

    setIsEditing(false);
  };

  const handleCancelRecipe = () => {
    if (!item) return;

    // Reset recipe form to original item values
    if (item.recipe && item.recipe.length > 0) {
      setEditRecipeForm(
        item.recipe.map((recipeItem) => ({
          inventoryItemId: recipeItem.inventoryItemId,
          quantity: recipeItem.quantity.toString(),
        }))
      );
    } else {
      setEditRecipeForm([]);
    }

    // Reset stock tracking mode to original value
    const currentMode = getMenuItemStockTrackingMode(item.id);
    setEditStockTrackingMode(currentMode);

    setIsEditingRecipe(false);
  };

  const handleSaveRecipe = () => {
    if (!item) return;

    const recipe = editRecipeForm
      .filter((recipeItem) => recipeItem.inventoryItemId && recipeItem.quantity)
      .map((recipeItem) => ({
        inventoryItemId: recipeItem.inventoryItemId,
        quantity: parseFloat(recipeItem.quantity) || 0,
      }));

    // Update stock tracking mode using store function
    const stockQuantity =
      editStockTrackingMode === "quantity"
        ? editForm.stockQuantity
          ? parseInt(editForm.stockQuantity)
          : undefined
        : undefined;
    const reorderThreshold =
      editStockTrackingMode === "quantity"
        ? editForm.reorderThreshold
          ? parseInt(editForm.reorderThreshold)
          : undefined
        : undefined;

    setMenuItemStockTrackingMode(
      item.id,
      editStockTrackingMode,
      stockQuantity,
      reorderThreshold
    );

    // Update recipe
    const updatedItem = { ...item, recipe };
    updateMenuItem(item.id, updatedItem);

    // Refresh the item state to reflect changes
    const refreshedItem = menuItems.find((m) => m.id === item.id);
    if (refreshedItem) {
      setItem(refreshedItem);
    }

    setIsEditingRecipe(false);
  };

  if (!item) {
    return (
      <View className="flex-1 justify-center items-center bg-[#212121]">
        <Text className="text-white text-xl">Item not found</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center"
        >
          <ArrowLeft color="#9CA3AF" size={24} />
          <Text className="text-white text-xl ml-2">Back</Text>
        </TouchableOpacity>
        {/* <TouchableOpacity
                    onPress={() => setIsEditing(!isEditing)}
                    className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
                >
                    {isEditing ? (
                        <>
                            <Save color="white" size={20} />
                            <Text className="text-white ml-2">Save</Text>
                        </>
                    ) : (
                        <>
                            <Edit color="white" size={20} />
                            <Text className="text-white ml-2">Edit</Text>
                        </>
                    )}
                </TouchableOpacity> */}
      </View>

      <ScrollView className="flex-1 p-4">
        {/* Item Overview */}
        <View className="bg-[#303030] rounded-xl p-6 mb-4">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-2xl font-bold text-white">{item.name}</Text>
            <View className="flex-row items-center">
              {item.stockQuantity !== undefined &&
              item.reorderThreshold !== undefined &&
              item.stockQuantity <= item.reorderThreshold ? (
                <AlertTriangle color="#F87171" size={24} />
              ) : (
                <CheckCircle color="#10B981" size={24} />
              )}
            </View>
          </View>

          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-300">Current Stock:</Text>
            <Text className="text-white font-semibold">
              {item.stockTrackingMode === "quantity"
                ? `${item.stockQuantity || 0} units`
                : item.stockTrackingMode === "in_stock"
                  ? "In Stock"
                  : "Out of Stock"}
            </Text>
          </View>

          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-300">Reorder Threshold:</Text>
            <Text className="text-white font-semibold">
              {item.reorderThreshold || "Not set"}
            </Text>
          </View>

          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-300">Price:</Text>
            <Text className="text-white font-semibold">
              ${item.price.toFixed(2)}
            </Text>
          </View>

          <View className="flex-row justify-between">
            <Text className="text-gray-300">Status:</Text>
            <Text
              className={`font-semibold ${item.availability !== false ? "text-green-400" : "text-red-400"}`}
            >
              {item.availability !== false ? "Available" : "Unavailable"}
            </Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View className="bg-[#303030] rounded-xl p-6 mb-4">
          <Text className="text-xl font-bold text-white mb-4">
            Quick Actions
          </Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => setIsLogUsageModalOpen(true)}
              className="flex-1 bg-blue-600 py-3 px-4 rounded-lg flex-row items-center justify-center"
            >
              <Minus color="white" size={20} />
              <Text className="text-white ml-2 font-semibold">Log Usage</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => historySheetRef.current?.expand()}
              className="flex-1 bg-gray-600 py-3 px-4 rounded-lg flex-row items-center justify-center"
            >
              <History color="white" size={20} />
              <Text className="text-white ml-2 font-semibold">
                View History
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Item Details Form */}
        <View className="bg-[#303030] rounded-xl p-6">
          <View className="flex-row items-center justify-between ">
            <Text className="text-xl font-bold text-white mb-4">
              Item Details
            </Text>
            {/* Item Details Edit/Save/Cancel Buttons */}
            <View className="flex-row justify-between items-center mt-6">
              {!isEditing ? (
                <TouchableOpacity
                  onPress={() => setIsEditing(true)}
                  className="bg-blue-600 p-6 rounded-lg flex-row items-center"
                >
                  <Edit color="white" size={20} />
                  <Text className="text-white ml-2 font-semibold">
                    Edit Item Details
                  </Text>
                </TouchableOpacity>
              ) : (
                <View className="flex-row gap-3 ">
                  <TouchableOpacity
                    onPress={handleSave}
                    className="w-fit bg-green-600 p-6 rounded-lg flex-row items-center justify-center"
                  >
                    <Save color="white" size={20} />
                    <Text className="text-white ml-2 font-semibold">
                      Save Changes
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCancel}
                    className="w-fit bg-gray-600 p-6 rounded-lg flex-row items-center justify-center"
                  >
                    <X color="white" size={20} />
                    <Text className="text-white ml-2 font-semibold">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Stock Tracking Options */}
          <View className="mb-6">
            <Text className="text-gray-300 mb-3">Stock Tracking</Text>
            <View className="flex-row gap-4">
              <TouchableOpacity
                disabled={!isEditing}
                onPress={() => {
                  setEditStockTrackingMode("in_stock");
                  setEditForm((prev) => ({
                    ...prev,
                    stockTrackingMode: "in_stock",
                  }));
                }}
                className={`flex-1 p-6 rounded-lg border-2 ${
                  editStockTrackingMode === "in_stock"
                    ? "border-blue-500 bg-blue-500/20"
                    : "border-gray-600 bg-gray-800"
                }`}
              >
                <View className="flex-row items-center justify-center">
                  <View
                    className={`w-4 h-4 rounded-full border-2 mr-2 ${
                      editStockTrackingMode === "in_stock"
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-400"
                    }`}
                  >
                    {editStockTrackingMode === "in_stock" && (
                      <View className="w-2 h-2 bg-white rounded-full m-0.5" />
                    )}
                  </View>
                  <Text
                    className={`font-semibold ${
                      editStockTrackingMode === "in_stock"
                        ? "text-blue-400"
                        : "text-gray-300"
                    }`}
                  >
                    In Stock
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!isEditing}
                onPress={() => {
                  setEditStockTrackingMode("out_of_stock");
                  setEditForm((prev) => ({
                    ...prev,
                    stockTrackingMode: "out_of_stock",
                  }));
                }}
                className={`flex-1 p-6 rounded-lg border-2 ${
                  editStockTrackingMode === "out_of_stock"
                    ? "border-blue-500 bg-blue-500/20"
                    : "border-gray-600 bg-gray-800"
                }`}
              >
                <View className="flex-row items-center justify-center">
                  <View
                    className={`w-4 h-4 rounded-full border-2 mr-2 ${
                      editStockTrackingMode === "out_of_stock"
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-400"
                    }`}
                  >
                    {editStockTrackingMode === "out_of_stock" && (
                      <View className="w-2 h-2 bg-white rounded-full m-0.5" />
                    )}
                  </View>
                  <Text
                    className={`font-semibold ${
                      editStockTrackingMode === "out_of_stock"
                        ? "text-blue-400"
                        : "text-gray-300"
                    }`}
                  >
                    Out of Stock
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!isEditing}
                onPress={() => {
                  setEditStockTrackingMode("quantity");
                  setEditForm((prev) => ({
                    ...prev,
                    stockTrackingMode: "quantity",
                  }));
                }}
                className={`flex-1 p-6 rounded-lg border-2 ${
                  editStockTrackingMode === "quantity"
                    ? "border-blue-500 bg-blue-500/20"
                    : "border-gray-600 bg-gray-800"
                }`}
              >
                <View className="flex-row items-center justify-center">
                  <View
                    className={`w-4 h-4 rounded-full border-2 mr-2 ${
                      editStockTrackingMode === "quantity"
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-400"
                    }`}
                  >
                    {editStockTrackingMode === "quantity" && (
                      <View className="w-2 h-2 bg-white rounded-full m-0.5" />
                    )}
                  </View>
                  <Text
                    className={`font-semibold ${
                      editStockTrackingMode === "quantity"
                        ? "text-blue-400"
                        : "text-gray-300"
                    }`}
                  >
                    Quantity
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
          <View className="flex flex-row gap-4">
            <View className="mb-4 flex-1">
              <Text className="text-gray-300 mb-2">Item Name</Text>
              <TextInput
                value={editForm.name}
                onChangeText={(text) =>
                  setEditForm((prev) => ({ ...prev, name: text }))
                }
                editable={isEditing}
                className={`p-3 rounded-lg h-20 ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                placeholder="Enter item name"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View className="mb-4 flex-1">
              <Text className="text-gray-300 mb-2">SKU / Barcode</Text>
              <TextInput
                value={editForm.sku}
                onChangeText={(text) =>
                  setEditForm((prev) => ({ ...prev, sku: text }))
                }
                editable={isEditing}
                className={`p-3 rounded-lg h-20 ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                placeholder="Enter SKU or barcode"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>

          <View className="flex flex-row gap-4">
            <View className="mb-4 flex-1">
              <Text className="text-gray-300 mb-2">Category</Text>
              <TextInput
                value={editForm.category}
                onChangeText={(text) =>
                  setEditForm((prev) => ({ ...prev, category: text }))
                }
                editable={isEditing}
                className={`p-3 rounded-lg h-20 ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                placeholder="Enter categories (comma separated)"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View className="mb-4 flex-1">
              <Text className="text-gray-300 mb-2">Default Vendor</Text>
              <TextInput
                value={editForm.defaultVendor}
                onChangeText={(text) =>
                  setEditForm((prev) => ({ ...prev, defaultVendor: text }))
                }
                editable={isEditing}
                className={`p-3 rounded-lg h-20 ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                placeholder="Select default vendor"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-gray-300 mb-2">Unit of Measure</Text>
            <TextInput
              value={editForm.unitOfMeasure}
              onChangeText={(text) =>
                setEditForm((prev) => ({ ...prev, unitOfMeasure: text }))
              }
              editable={isEditing}
              className={`p-3 rounded-lg h-20 ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
              placeholder="e.g., Case, Bottle, Lbs, Gallon"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View className="flex w-full flex-1 flex-row gap-4">
            {editStockTrackingMode === "quantity" ? (
              <View className="mb-4 flex flex-row gap-x-4">
                <View className="w-1/3">
                  <Text className="text-gray-300 mb-1">
                    Set Quantity Amount
                  </Text>
                  <View className="flex-row items-center">
                    <TextInput
                      className={`flex-1 rounded-lg px-3 py-2 h-20 ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                      keyboardType="numeric"
                      value={editForm.stockQuantity}
                      onChangeText={(text) => {
                        // Only allow numbers
                        const numeric = text.replace(/[^0-9.]/g, "");
                        setEditForm((prev) => ({
                          ...prev,
                          stockQuantity: numeric,
                        }));
                      }}
                      placeholder="Enter quantity"
                      placeholderTextColor="#888"
                      editable={isEditing}
                    />
                  </View>
                </View>
                <View className="w-1/3">
                  <Text className="text-gray-300 mb-1">Reorder Threshold</Text>
                  <TextInput
                    className={`flex-1 rounded-lg px-3 py-2 h-20 ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                    keyboardType="numeric"
                    value={editForm.reorderThreshold}
                    onChangeText={(text) => {
                      const numeric = text.replace(/[^0-9.]/g, "");
                      setEditForm((prev) => ({
                        ...prev,
                        reorderThreshold: numeric,
                      }));
                    }}
                    editable={isEditing}
                    placeholder="Enter threshold"
                    placeholderTextColor="#888"
                  />
                </View>
              </View>
            ) : (
              <View className="flex-row gap-4 w-full">
                <View className="flex-1 mb-4">
                  <Text className="text-gray-300 mb-2">Stock Quantity</Text>
                  {editStockTrackingMode === "in_stock" ? (
                    <View className="p-3 rounded-lg bg-green-600/20 border border-green-500">
                      <Text className="text-green-400 font-semibold text-center">
                        In Stock
                      </Text>
                    </View>
                  ) : (
                    <TextInput
                      value={editForm.stockQuantity}
                      onChangeText={(text) =>
                        setEditForm((prev) => ({
                          ...prev,
                          stockQuantity: text,
                        }))
                      }
                      editable={isEditing}
                      keyboardType="numeric"
                      className={`p-3 rounded-lg h-20 ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                      placeholder="0"
                      placeholderTextColor="#9CA3AF"
                    />
                  )}
                </View>

                <View className="flex-1 mb-4">
                  <Text className="text-gray-300 mb-2">Reorder Threshold</Text>
                  {editStockTrackingMode === "in_stock" ? (
                    <View className="p-3 rounded-lg bg-green-600/20 border border-green-500">
                      <Text className="text-green-400 font-semibold text-center">
                        In Stock
                      </Text>
                    </View>
                  ) : (
                    <TextInput
                      value={editForm.reorderThreshold}
                      onChangeText={(text) =>
                        setEditForm((prev) => ({
                          ...prev,
                          reorderThreshold: text,
                        }))
                      }
                      editable={isEditing}
                      keyboardType="numeric"
                      className={`p-3 rounded-lg h-20 ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                      placeholder="0"
                      placeholderTextColor="#9CA3AF"
                    />
                  )}
                </View>
              </View>
            )}
          </View>

          <View className="mb-4">
            <Text className="text-gray-300 mb-2">Price</Text>
            <TextInput
              value={editForm.price}
              onChangeText={(text) =>
                setEditForm((prev) => ({ ...prev, price: text }))
              }
              editable={isEditing}
              keyboardType="numeric"
              className={`p-3 rounded-lg h-20 ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
              placeholder="0.00"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        {/* Recipe Section */}
        <View className="bg-[#303030] rounded-xl p-6 mt-4">
          {/* Recipe Items */}
          <View>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-bold text-white">
                Recipe & Stock Tracking
              </Text>
              {!isEditingRecipe ? (
                <TouchableOpacity
                  onPress={() => setIsEditingRecipe(true)}
                  className="bg-blue-600 px-4 py-2 rounded-lg flex-row items-center"
                >
                  <Edit color="white" size={20} />
                  <Text className="text-white ml-2 font-semibold">
                    Edit Recipe
                  </Text>
                </TouchableOpacity>
              ) : (
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={handleSaveRecipe}
                    className="bg-green-600 px-4 py-2 rounded-lg flex-row items-center"
                  >
                    <Save color="white" size={20} />
                    <Text className="text-white ml-2 font-semibold">
                      Save Recipe
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCancelRecipe}
                    className="bg-gray-600 px-4 py-2 rounded-lg flex-row items-center"
                  >
                    <X color="white" size={20} />
                    <Text className="text-white ml-2 font-semibold">
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-gray-300">Recipe Items</Text>

              {/* {!isEditingRecipe ? (<TouchableOpacity
                                onPress={() => setIsEditingRecipe(true)}
                                className="bg-blue-600 px-4 py-2 rounded-lg flex-row items-center"
                            >
                                <Plus color="white" size={16} />
                                <Text className="text-white ml-2 font-semibold">Edit Recipe</Text>
                            </TouchableOpacity>) :

                                <View className="flex-row gap-3">
                                    <TouchableOpacity
                                        onPress={handleSaveRecipe}
                                        className="bg-green-600 px-4 py-2 rounded-lg flex-row items-center"
                                    >
                                        <SaveAll color="white" size={16} />
                                        <Text className="text-white ml-2 font-semibold">Save</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => setIsEditingRecipe(false)}
                                        className="bg-red-600 px-4 py-2 rounded-lg flex-row items-center"
                                    >
                                        <X color="white" size={16} />
                                        <Text className="text-white ml-2 font-semibold">Cancel</Text>
                                    </TouchableOpacity>
                                </View>

                            } */}
            </View>

            {editRecipeForm.length === 0 ? (
              <View className="bg-gray-800 rounded-lg p-6 items-center">
                <Text className="text-gray-400 text-center mb-2">
                  No recipe items defined
                </Text>
                <Text className="text-gray-500 text-sm text-center mb-4">
                  Add inventory items to create a recipe for this menu item
                </Text>
                {isEditingRecipe && (
                  <TouchableOpacity
                    onPress={openInventorySelection}
                    className="bg-blue-600 px-4 py-2 rounded-lg flex-row items-center"
                  >
                    <Plus color="white" size={16} />
                    <Text className="text-white ml-2 font-semibold">
                      Add Recipe Item
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View className="gap-y-3">
                {editRecipeForm.map((recipeItem, index) => (
                  <View key={index} className="bg-gray-800 rounded-lg p-4">
                    <View className="flex-row items-center gap-3">
                      <TouchableOpacity
                        className="flex-1"
                        onPress={() => {
                          if (isEditingRecipe) {
                            setEditingRecipeItemIndex(index);
                            openInventorySelection();
                          }
                        }}
                        disabled={!isEditingRecipe}
                      >
                        <View
                          className={`${isEditingRecipe ? "opacity-100" : "opacity-75"}`}
                        >
                          <Text
                            className={`font-semibold ${isEditingRecipe ? "text-white" : "text-gray-300"}`}
                          >
                            {getInventoryItemName(recipeItem.inventoryItemId)}
                          </Text>
                          <Text
                            className={`text-sm ${isEditingRecipe ? "text-gray-400" : "text-gray-500"}`}
                          >
                            {getInventoryItemUnit(recipeItem.inventoryItemId)}
                          </Text>
                          {isEditingRecipe && (
                            <Text className="text-blue-400 text-xs mt-1">
                              Tap to change item
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>

                      <View className="w-24">
                        {isEditingRecipe ? (
                          <View>
                            <TextInput
                              value={recipeItem.quantity}
                              onChangeText={(text) =>
                                updateRecipeItemQuantity(index, text)
                              }
                              keyboardType="numeric"
                              className="bg-[#212121] border border-gray-600 text-white p-2 rounded text-center h-20"
                              placeholder="0"
                              placeholderTextColor="#9CA3AF"
                            />
                            <Text className="text-gray-400 text-xs text-center mt-1">
                              Quantity
                            </Text>
                          </View>
                        ) : (
                          <View>
                            <Text className="text-gray-300 text-center font-semibold">
                              {recipeItem.quantity}
                            </Text>
                            <Text className="text-gray-400 text-xs text-center mt-1">
                              Quantity
                            </Text>
                          </View>
                        )}
                      </View>

                      {isEditingRecipe && (
                        <TouchableOpacity
                          onPress={() => removeRecipeItem(index)}
                          className="bg-red-600 p-2 rounded-lg"
                        >
                          <X color="white" size={16} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}

                {isEditingRecipe && (
                  <TouchableOpacity
                    onPress={openInventorySelection}
                    className="bg-gray-700 border-2 border-dashed border-gray-500 rounded-lg p-4 items-center"
                  >
                    <Plus color="#9CA3AF" size={24} />
                    <Text className="text-gray-400 mt-2 font-semibold">
                      Add Recipe Item
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Log Usage Modal */}
      <Modal
        visible={isLogUsageModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsLogUsageModalOpen(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="bg-[#303030] rounded-xl p-6 w-full max-w-md">
            <Text className="text-2xl font-bold text-white mb-4">
              Log Usage
            </Text>

            <View className="mb-4">
              <Text className="text-lg text-gray-300 mb-2">
                Item: {item.name}
              </Text>
            </View>

            <View className="mb-4">
              <Text className="text-lg text-gray-300 mb-2">Quantity Used</Text>
              <TextInput
                value={logUsageForm.quantityUsed}
                onChangeText={(text) =>
                  setLogUsageForm((prev) => ({ ...prev, quantityUsed: text }))
                }
                placeholder="Enter quantity used"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                className="bg-[#212121] border border-gray-600 rounded-lg px-4 py-3 text-white text-lg h-20"
              />
            </View>

            <View className="mb-4">
              <Text className="text-lg text-gray-300 mb-2">
                Reason for Adjustment
              </Text>
              <View className="bg-[#212121] border border-gray-600 rounded-lg">
                <TouchableOpacity
                  onPress={() =>
                    setLogUsageForm((prev) => ({
                      ...prev,
                      reason: "SALES_CONSUMPTION",
                    }))
                  }
                  className={`p-3 ${logUsageForm.reason === "SALES_CONSUMPTION" ? "bg-blue-600" : ""}`}
                >
                  <Text className="text-white">Sales / Consumption</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    setLogUsageForm((prev) => ({
                      ...prev,
                      reason: "SPOILAGE_WASTE",
                    }))
                  }
                  className={`p-3 ${logUsageForm.reason === "SPOILAGE_WASTE" ? "bg-blue-600" : ""}`}
                >
                  <Text className="text-white">Spoilage / Waste</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    setLogUsageForm((prev) => ({
                      ...prev,
                      reason: "INTERNAL_TRANSFER",
                    }))
                  }
                  className={`p-3 ${logUsageForm.reason === "INTERNAL_TRANSFER" ? "bg-blue-600" : ""}`}
                >
                  <Text className="text-white">Internal Transfer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    setLogUsageForm((prev) => ({
                      ...prev,
                      reason: "COUNT_CORRECTION",
                    }))
                  }
                  className={`p-3 ${logUsageForm.reason === "COUNT_CORRECTION" ? "bg-blue-600" : ""}`}
                >
                  <Text className="text-white">Count Correction</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View className="mb-6">
              <Text className="text-lg text-gray-300 mb-2">
                Notes (Optional)
              </Text>
              <TextInput
                value={logUsageForm.notes}
                onChangeText={(text) =>
                  setLogUsageForm((prev) => ({ ...prev, notes: text }))
                }
                placeholder="Additional details..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                className="bg-[#212121] border border-gray-600 rounded-lg px-4 py-3 text-white text-lg h-20"
              />
            </View>

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setIsLogUsageModalOpen(false)}
                className="flex-1 p-6 bg-gray-600 rounded-lg"
              >
                <Text className="text-white text-lg font-semibold text-center">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleLogUsage}
                className="flex-1 p-6 bg-blue-600 rounded-lg"
              >
                <Text className="text-white text-lg font-semibold text-center">
                  Log Usage
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Inventory History Bottom Sheet */}
      <BottomSheet
        ref={historySheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose={true}
        backgroundStyle={{ backgroundColor: "#303030" }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
        backdropComponent={renderBackdrop}
      >
        <View className="flex-1">
          <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
            <Text className="text-xl font-bold text-white">
              Inventory History
            </Text>
            <TouchableOpacity onPress={() => historySheetRef.current?.close()}>
              <X color="#9CA3AF" size={24} />
            </TouchableOpacity>
          </View>

          {inventoryHistory.length === 0 ? (
            <View className="flex-1 justify-center items-center p-8">
              <History color="#9CA3AF" size={48} />
              <Text className="text-gray-400 text-lg mt-4 text-center">
                No transaction history available
              </Text>
              <Text className="text-gray-500 text-sm mt-2 text-center">
                Transaction history will appear here once you start logging
                usage or stock adjustments.
              </Text>
            </View>
          ) : (
            <BottomSheetFlatList
              data={inventoryHistory}
              keyExtractor={(item) => item.id}
              renderItem={({ item: transaction }) => (
                <View className="p-4 border-b border-gray-700">
                  <View className="flex-row items-center justify-between mb-2">
                    <View
                      className={`px-2 py-1 rounded ${getTransactionTypeColor(transaction.type)}`}
                    >
                      <Text className="text-white text-sm font-semibold">
                        {getTransactionTypeLabel(transaction.type)}
                      </Text>
                    </View>
                    <Text className="text-gray-400 text-sm">
                      {new Date(transaction.timestamp).toLocaleDateString()}
                    </Text>
                  </View>

                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-white font-semibold">
                      {transaction.quantityChange > 0 ? "+" : ""}
                      {transaction.quantityChange} units
                    </Text>
                    <Text className="text-gray-300">
                      Result: {transaction.resultingQuantity}
                    </Text>
                  </View>

                  {transaction.notes && (
                    <Text className="text-gray-400 text-sm mb-1">
                      {transaction.notes}
                    </Text>
                  )}

                  {transaction.reference && (
                    <Text className="text-blue-400 text-sm">
                      Ref: {transaction.reference}
                    </Text>
                  )}
                </View>
              )}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          )}
        </View>
      </BottomSheet>

      {/* Inventory Selection Bottom Sheet */}
      <BottomSheet
        ref={inventorySelectionSheetRef}
        index={-1}
        snapPoints={inventorySnapPoints}
        enablePanDownToClose={true}
        backgroundStyle={{ backgroundColor: "#303030" }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
        backdropComponent={renderInventoryBackdrop}
      >
        <View className="flex-1">
          <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
            <View className="flex-1">
              <Text className="text-xl font-bold text-white">
                {editingRecipeItemIndex !== null
                  ? "Replace Inventory Item"
                  : "Select Inventory Item"}
              </Text>
              {editingRecipeItemIndex !== null && (
                <Text className="text-blue-400 text-sm mt-1">
                  Choose a new item to replace the current one
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => {
                setEditingRecipeItemIndex(null);
                inventorySelectionSheetRef.current?.close();
              }}
            >
              <X color="#9CA3AF" size={24} />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View className="p-4 border-b border-gray-700">
            <View className="flex-row items-center bg-[#212121] rounded-lg px-3 py-2">
              <Search color="#9CA3AF" size={20} />
              <TextInput
                value={inventorySearchQuery}
                onChangeText={setInventorySearchQuery}
                placeholder="Search inventory items..."
                placeholderTextColor="#9CA3AF"
                className="flex-1 text-white ml-3 h-20"
              />
            </View>
          </View>

          {/* Inventory Items List */}
          {filteredInventoryItems.length === 0 ? (
            <View className="flex-1 justify-center items-center p-8">
              <Text className="text-gray-400 text-lg text-center">
                {inventorySearchQuery
                  ? "No items found"
                  : "No inventory items available"}
              </Text>
            </View>
          ) : (
            <BottomSheetFlatList
              data={filteredInventoryItems}
              keyExtractor={(item) => item.id}
              renderItem={({ item: inventoryItem }) => {
                const isAlreadyInRecipe = editRecipeForm.some(
                  (recipeItem) =>
                    recipeItem.inventoryItemId === inventoryItem.id
                );
                const isCurrentlyEditing =
                  editingRecipeItemIndex !== null &&
                  editRecipeForm[editingRecipeItemIndex]?.inventoryItemId ===
                    inventoryItem.id;

                return (
                  <TouchableOpacity
                    onPress={() => selectInventoryItem(inventoryItem.id)}
                    disabled={isAlreadyInRecipe && !isCurrentlyEditing}
                    className={`p-4 border-b border-gray-700 ${
                      isCurrentlyEditing
                        ? "bg-blue-900 border-blue-600"
                        : isAlreadyInRecipe
                          ? "bg-gray-800 opacity-50"
                          : "bg-transparent"
                    }`}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <Text
                          className={`font-semibold ${
                            isCurrentlyEditing
                              ? "text-blue-300"
                              : isAlreadyInRecipe
                                ? "text-gray-500"
                                : "text-white"
                          }`}
                        >
                          {inventoryItem.name}
                        </Text>
                        <Text
                          className={`text-sm ${
                            isCurrentlyEditing
                              ? "text-blue-400"
                              : isAlreadyInRecipe
                                ? "text-gray-600"
                                : "text-gray-400"
                          }`}
                        >
                          {inventoryItem.stockQuantity} {inventoryItem.unit} • $
                          {inventoryItem.cost.toFixed(2)}
                        </Text>
                      </View>
                      {isCurrentlyEditing ? (
                        <View className="bg-blue-600 px-2 py-1 rounded">
                          <Text className="text-white text-xs">
                            Currently Selected
                          </Text>
                        </View>
                      ) : isAlreadyInRecipe ? (
                        <View className="bg-gray-600 px-2 py-1 rounded">
                          <Text className="text-gray-300 text-xs">Added</Text>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          )}
        </View>
      </BottomSheet>
    </View>
  );
};

export default MenuItemScreen;
