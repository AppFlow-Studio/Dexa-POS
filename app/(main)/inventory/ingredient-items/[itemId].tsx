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

const IngredientItemScreen = () => {
  const { itemId } = useLocalSearchParams();
  const router = useRouter();
  const { inventoryItems, updateInventoryItem, vendors } = useInventoryStore();
  const [showError, setShowError] = useState({
    title: "",
    description: "",
    show: false,
  });
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editStockTrackingMode, setEditStockTrackingMode] = useState<
    "in_stock" | "out_of_stock" | "quantity"
  >("in_stock");
  const [isLogUsageModalOpen, setIsLogUsageModalOpen] = useState(false);
  const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false);
  const [inventoryHistory, setInventoryHistory] = useState<
    InventoryTransaction[]
  >([]);

  // Bottom sheet refs
  const historySheetRef = React.useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["90%"], []);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    sku: "",
    category: "",
    defaultVendor: "",
    unitOfMeasure: "",
    stockQuantity: "",
    reorderThreshold: "",
    cost: "",
  });

  // Log usage form state
  const [logUsageForm, setLogUsageForm] = useState({
    quantityUsed: "",
    reason: "",
    customReason: "",
    notes: "",
  });

  // Add stock form state
  const [addStockForm, setAddStockForm] = useState({
    quantityAdded: "",
    reason: "",
    notes: "",
  });
  // Custom note entry for history sheet
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
        setEditStockTrackingMode(
          (foundItem as any).stockTrackingMode || "in_stock"
        );
        generateMockHistory(foundItem.id);
      }
    }
  }, [itemId, inventoryItems]);

  const generateMockHistory = (id: string) => {
    const mockHistory: InventoryTransaction[] = [
      {
        id: "1",
        itemId: id,
        type: "PO_RECEIPT",
        quantityChange: 100,
        resultingQuantity: 100,
        reason: "Initial stock from purchase order",
        timestamp: "2024-01-10T09:00:00Z",
        userId: "user1",
        reference: "PO-2024-001",
      },
      {
        id: "2",
        itemId: id,
        type: "SALES_CONSUMPTION",
        quantityChange: -15,
        resultingQuantity: 85,
        reason: "Used in menu item preparation",
        notes: "Used in 15 menu items",
        timestamp: "2024-01-12T14:30:00Z",
        userId: "user2",
      },
      {
        id: "3",
        itemId: id,
        type: "SPOILAGE_WASTE",
        quantityChange: -5,
        resultingQuantity: 80,
        reason: "Spoilage/Waste",
        notes: "Expired items removed",
        timestamp: "2024-01-14T11:15:00Z",
        userId: "user1",
      },
      {
        id: "4",
        itemId: id,
        type: "COUNT_CORRECTION",
        quantityChange: 3,
        resultingQuantity: 83,
        reason: "Count correction",
        notes: "Found additional units during inventory count",
        timestamp: "2024-01-16T16:45:00Z",
        userId: "user3",
      },
    ];
    setInventoryHistory(mockHistory);
  };

  const handleSave = () => {
    if (!item) return;

    const roundedStockQuantity =
      editForm.stockQuantity !== ""
        ? Number(parseFloat(editForm.stockQuantity).toFixed(2))
        : item.stockQuantity;
    // Only persist quantity fields when mode is quantity
    const quantityFields =
      editStockTrackingMode === "quantity"
        ? {
            stockQuantity: roundedStockQuantity,
            reorderThreshold: editForm.reorderThreshold
              ? parseInt(editForm.reorderThreshold)
              : item.reorderThreshold,
          }
        : {
            stockQuantity: undefined,
            reorderThreshold: undefined,
          };
    const updatedItem = {
      ...item,
      name: editForm.name,
      category: editForm.category,
      vendorId: editForm.defaultVendor || null,
      unit: editForm.unitOfMeasure as any,
      ...(quantityFields as any),
      stockTrackingMode: editStockTrackingMode,
      cost: editForm.cost ? parseFloat(editForm.cost) : item.cost,
    };

    updateInventoryItem(item.id, updatedItem);
    setItem(updatedItem);
    setIsEditing(false);
  };

  const handleLogUsage = () => {
    if (!item || !logUsageForm.quantityUsed || !logUsageForm.reason) return;
    if (editStockTrackingMode !== "quantity") {
      setShowError({
        title: "This item is not set to track stock by quantity.",
        description:
          "Please set the stock tracking mode to quantity to log usage.",
        show: true,
      });
      return;
    } // Only applicable when tracking by quantity
    const quantityChange = -parseFloat(logUsageForm.quantityUsed);
    const newQuantity = Number(
      ((item.stockQuantity || 0) + quantityChange).toFixed(2)
    );

    const newTransaction: InventoryTransaction = {
      id: Date.now().toString(),
      itemId: item.id,
      type: (logUsageForm.reason === "CUSTOM"
        ? "COUNT_CORRECTION"
        : logUsageForm.reason) as any,
      quantityChange,
      resultingQuantity: newQuantity,
      reason:
        logUsageForm.reason === "CUSTOM" && logUsageForm.customReason.trim()
          ? logUsageForm.customReason.trim()
          : logUsageForm.reason,
      notes: logUsageForm.notes,
      timestamp: new Date().toISOString(),
      userId: "current_user",
    };

    updateInventoryItem(item.id, {
      ...item,
      stockQuantity: newQuantity,
    });
    setInventoryHistory((prev) => [newTransaction, ...prev]);
    setLogUsageForm({
      quantityUsed: "",
      reason: "",
      customReason: "",
      notes: "",
    });
    setIsLogUsageModalOpen(false);
    setItem((prev) => (prev ? { ...prev, stockQuantity: newQuantity } : null));
  };

  const handleAddStock = () => {
    if (!item || !addStockForm.quantityAdded || !addStockForm.reason) return;
    if (editStockTrackingMode !== "quantity") return; // Only applicable when tracking by quantity

    const quantityChange = parseFloat(addStockForm.quantityAdded);
    const newQuantity = Number(
      ((item.stockQuantity || 0) + quantityChange).toFixed(2)
    );

    const newTransaction: InventoryTransaction = {
      id: Date.now().toString(),
      itemId: item.id,
      type: addStockForm.reason as any,
      quantityChange,
      resultingQuantity: newQuantity,
      reason: addStockForm.reason,
      notes: addStockForm.notes,
      timestamp: new Date().toISOString(),
      userId: "current_user",
    };

    updateInventoryItem(item.id, {
      ...item,
      stockQuantity: newQuantity,
    });
    setInventoryHistory((prev) => [newTransaction, ...prev]);
    setAddStockForm({ quantityAdded: "", reason: "", notes: "" });
    setIsAddStockModalOpen(false);
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
      case "NOTE":
        return "Note";
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

  const getVendorName = (vendorId?: string | null) => {
    if (!vendorId) return "No vendor";
    const vendor = vendors.find((v) => v.id === vendorId);
    return vendor ? vendor.name : "Unknown vendor";
  };

  const renderBackdrop = useMemo(
    () => (props: any) =>
      (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.7}
        />
      ),
    []
  );

  if (!item) {
    return (
      <View className="flex-1 justify-center items-center bg-[#212121]">
        <Text className="text-white text-lg">Item not found</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#212121]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-2 border-b border-gray-700">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center"
        >
          <ArrowLeft color="#9CA3AF" size={20} />
          <Text className="text-white text-lg ml-2">Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setIsEditing(!isEditing)}
          className="flex-row items-center bg-blue-600 px-3 py-1 rounded-lg"
        >
          {isEditing ? (
            <>
              <Save color="white" size={18} />
              <Text className="text-white ml-2">Save</Text>
            </>
          ) : (
            <>
              <Edit color="white" size={18} />
              <Text className="text-white ml-2">Edit</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 p-2">
        {/* Item Overview */}
        <View className="bg-[#303030] rounded-xl p-3 mb-2">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-bold text-white">{item.name}</Text>
            <View className="flex-row items-center">
              {item.stockQuantity !== undefined &&
              item.reorderThreshold !== undefined &&
              item.stockQuantity <= item.reorderThreshold ? (
                <AlertTriangle color="#F87171" size={20} />
              ) : (
                <CheckCircle color="#10B981" size={20} />
              )}
            </View>
          </View>

          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-300">Current Stock:</Text>
            {((item as any).stockTrackingMode || editStockTrackingMode) ===
            "quantity" ? (
              <Text className="text-white font-semibold">
                {item.stockQuantity ?? 0} {item.unit}
              </Text>
            ) : ((item as any).stockTrackingMode || editStockTrackingMode) ===
              "in_stock" ? (
              <Text className="text-green-400 font-semibold">In Stock</Text>
            ) : (
              <Text className="text-red-400 font-semibold">Out of Stock</Text>
            )}
          </View>

          {((item as any).stockTrackingMode || editStockTrackingMode) ===
            "quantity" && (
            <View className="flex-row justify-between mb-2">
              <Text className="text-gray-300">Reorder Threshold:</Text>
              <Text className="text-white font-semibold">
                {item.reorderThreshold || "Not set"}
              </Text>
            </View>
          )}

          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-300">Cost per Unit:</Text>
            <Text className="text-white font-semibold">
              ${item.cost?.toFixed(2) || "0.00"}
            </Text>
          </View>

          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-300">Vendor:</Text>
            <Text className="text-white font-semibold">
              {getVendorName(item.vendorId)}
            </Text>
          </View>

          <View className="flex-row justify-between">
            <Text className="text-gray-300">Category:</Text>
            <Text className="text-white font-semibold">{item.category}</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View className="bg-[#303030] rounded-xl p-3 mb-2">
          <Text className="text-lg font-bold text-white mb-3">
            Quick Actions
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => setIsLogUsageModalOpen(true)}
              className="flex-1 bg-red-600 py-2 px-3 rounded-lg flex-row items-center justify-center"
            >
              <Minus color="white" size={18} />
              <Text className="text-white ml-2 font-semibold">Log Usage</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setIsAddStockModalOpen(true)}
              className="flex-1 bg-green-600 py-2 px-3 rounded-lg flex-row items-center justify-center"
            >
              <Plus color="white" size={18} />
              <Text className="text-white ml-2 font-semibold">Add Stock</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => historySheetRef.current?.expand()}
            className="w-full bg-gray-600 py-2 px-3 rounded-lg flex-row items-center justify-center mt-2"
          >
            <History color="white" size={18} />
            <Text className="text-white ml-2 font-semibold">View History</Text>
          </TouchableOpacity>
        </View>

        {/* Item Details Form */}
        <View className="bg-[#303030] rounded-xl p-3">
          <Text className="text-lg font-bold text-white mb-3">
            Item Details
          </Text>

          {/* Stock Tracking Options */}
          <View className="mb-4">
            <Text className="text-gray-300 mb-2">Stock Tracking</Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                disabled={!isEditing}
                onPress={() => setEditStockTrackingMode("in_stock")}
                className={`flex-1 p-2 rounded-lg border-2 ${
                  editStockTrackingMode === "in_stock"
                    ? "border-blue-500 bg-blue-500/20"
                    : "border-gray-600 bg-gray-800"
                }`}
              >
                <Text
                  className={`text-center font-semibold ${
                    editStockTrackingMode === "in_stock"
                      ? "text-blue-400"
                      : "text-gray-300"
                  }`}
                >
                  In Stock
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!isEditing}
                onPress={() => setEditStockTrackingMode("out_of_stock")}
                className={`flex-1 p-2 rounded-lg border-2 ${
                  editStockTrackingMode === "out_of_stock"
                    ? "border-blue-500 bg-blue-500/20"
                    : "border-gray-600 bg-gray-800"
                }`}
              >
                <Text
                  className={`text-center font-semibold ${
                    editStockTrackingMode === "out_of_stock"
                      ? "text-blue-400"
                      : "text-gray-300"
                  }`}
                >
                  Out of Stock
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!isEditing}
                onPress={() => setEditStockTrackingMode("quantity")}
                className={`flex-1 p-2 rounded-lg border-2 ${
                  editStockTrackingMode === "quantity"
                    ? "border-blue-500 bg-blue-500/20"
                    : "border-gray-600 bg-gray-800"
                }`}
              >
                <Text
                  className={`text-center font-semibold ${
                    editStockTrackingMode === "quantity"
                      ? "text-blue-400"
                      : "text-gray-300"
                  }`}
                >
                  Quantity
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="mb-2">
            <Text className="text-gray-300 mb-2">Item Name</Text>
            <TextInput
              value={editForm.name}
              onChangeText={(text) =>
                setEditForm((prev) => ({ ...prev, name: text }))
              }
              editable={isEditing}
              className={`p-2 rounded-lg ${
                isEditing
                  ? "bg-[#212121] border border-gray-600 text-white"
                  : "bg-gray-800 text-gray-400"
              }`}
              placeholder="Enter item name"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View className="mb-2">
            <Text className="text-gray-300 mb-2">SKU / Barcode</Text>
            <TextInput
              value={editForm.sku}
              onChangeText={(text) =>
                setEditForm((prev) => ({ ...prev, sku: text }))
              }
              editable={isEditing}
              className={`p-2 rounded-lg ${
                isEditing
                  ? "bg-[#212121] border border-gray-600 text-white"
                  : "bg-gray-800 text-gray-400"
              }`}
              placeholder="Enter SKU or barcode"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View className="mb-2">
            <Text className="text-gray-300 mb-2">Category</Text>
            <TextInput
              value={editForm.category}
              onChangeText={(text) =>
                setEditForm((prev) => ({ ...prev, category: text }))
              }
              editable={isEditing}
              className={`p-2 rounded-lg ${
                isEditing
                  ? "bg-[#212121] border border-gray-600 text-white"
                  : "bg-gray-800 text-gray-400"
              }`}
              placeholder="e.g., Spirits, Produce, Dry Goods"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View className="mb-2">
            <Text className="text-gray-300 mb-2">Default Vendor</Text>
            <TextInput
              value={editForm.defaultVendor}
              onChangeText={(text) =>
                setEditForm((prev) => ({ ...prev, defaultVendor: text }))
              }
              editable={isEditing}
              className={`p-2 rounded-lg ${
                isEditing
                  ? "bg-[#212121] border border-gray-600 text-white"
                  : "bg-gray-800 text-gray-400"
              }`}
              placeholder="Select default vendor"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View className="mb-2">
            <Text className="text-gray-300 mb-2">Unit of Measure</Text>
            <TextInput
              value={editForm.unitOfMeasure}
              onChangeText={(text) =>
                setEditForm((prev) => ({ ...prev, unitOfMeasure: text }))
              }
              editable={isEditing}
              className={`p-2 rounded-lg ${
                isEditing
                  ? "bg-[#212121] border border-gray-600 text-white"
                  : "bg-gray-800 text-gray-400"
              }`}
              placeholder="e.g., Case, Bottle, Lbs"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {editStockTrackingMode === "quantity" ? (
            <View className="flex-row gap-2">
              <View className="flex-1 mb-2">
                <Text className="text-gray-300 mb-2">Stock Quantity</Text>
                <TextInput
                  value={editForm.stockQuantity}
                  onChangeText={(text) => {
                    const numeric = text.replace(/[^0-9.]/g, "");
                    setEditForm((prev) => ({
                      ...prev,
                      stockQuantity: numeric,
                    }));
                  }}
                  editable={isEditing}
                  keyboardType="numeric"
                  className={`p-2 rounded-lg ${
                    isEditing
                      ? "bg-[#212121] border border-gray-600 text-white"
                      : "bg-gray-800 text-gray-400"
                  }`}
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View className="flex-1 mb-2">
                <Text className="text-gray-300 mb-2">Reorder Threshold</Text>
                <TextInput
                  value={editForm.reorderThreshold}
                  onChangeText={(text) => {
                    const numeric = text.replace(/[^0-9.]/g, "");
                    setEditForm((prev) => ({
                      ...prev,
                      reorderThreshold: numeric,
                    }));
                  }}
                  editable={isEditing}
                  keyboardType="numeric"
                  className={`p-2 rounded-lg ${
                    isEditing
                      ? "bg-[#212121] border border-gray-600 text-white"
                      : "bg-gray-800 text-gray-400"
                  }`}
                  placeholder="0"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </View>
          ) : null}

          <View className="mb-2">
            <Text className="text-gray-300 mb-2">Cost per Unit</Text>
            <TextInput
              value={editForm.cost}
              onChangeText={(text) =>
                setEditForm((prev) => ({ ...prev, cost: text }))
              }
              editable={isEditing}
              keyboardType="numeric"
              className={`p-2 rounded-lg ${
                isEditing
                  ? "bg-[#212121] border border-gray-600 text-white"
                  : "bg-gray-800 text-gray-400"
              }`}
              placeholder="0.00"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {isEditing && (
            <View className="flex-row gap-2 mt-2">
              <TouchableOpacity
                onPress={handleSave}
                className="flex-1 bg-green-600 py-2 px-3 rounded-lg flex-row items-center justify-center"
              >
                <Save color="white" size={18} />
                <Text className="text-white ml-2 font-semibold">
                  Save Changes
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setIsEditing(false)}
                className="flex-1 bg-gray-600 py-2 px-3 rounded-lg flex-row items-center justify-center"
              >
                <X color="white" size={18} />
                <Text className="text-white ml-2 font-semibold">Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
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
          <View className="bg-[#303030] rounded-xl p-3 w-full h-[90%] max-w-5xl">
            <Text className="text-lg font-bold text-white mb-3">Log Usage</Text>

            <View className="mb-2">
              <Text className="text-base text-gray-300 mb-2">
                Item: {item.name}
              </Text>
            </View>

            <View className="mb-2">
              <Text className="text-base text-gray-300 mb-2">
                Quantity Used
              </Text>
              <TextInput
                value={logUsageForm.quantityUsed}
                onChangeText={(text) =>
                  setLogUsageForm((prev) => ({ ...prev, quantityUsed: text }))
                }
                placeholder="Enter quantity used"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                className="bg-[#212121] border border-gray-600 rounded-lg p-2 text-white text-base"
              />
            </View>

            <View className="mb-2">
              <Text className="text-base text-gray-300 mb-2">
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
                  className={`p-2 ${
                    logUsageForm.reason === "SALES_CONSUMPTION"
                      ? "bg-blue-600"
                      : ""
                  }`}
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
                  className={`p-2 ${
                    logUsageForm.reason === "SPOILAGE_WASTE"
                      ? "bg-blue-600"
                      : ""
                  }`}
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
                  className={`p-3 ${
                    logUsageForm.reason === "INTERNAL_TRANSFER"
                      ? "bg-blue-600"
                      : ""
                  }`}
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
                  className={`p-3 ${
                    logUsageForm.reason === "COUNT_CORRECTION"
                      ? "bg-blue-600"
                      : ""
                  }`}
                >
                  <Text className="text-white">Count Correction</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    setLogUsageForm((prev) => ({ ...prev, reason: "CUSTOM" }))
                  }
                  className={`p-3 ${
                    logUsageForm.reason === "CUSTOM" ? "bg-blue-600" : ""
                  }`}
                >
                  <Text className="text-white">Other (Custom)</Text>
                </TouchableOpacity>
              </View>
              {logUsageForm.reason === "CUSTOM" && (
                <View className="mt-2">
                  <Text className="text-gray-300 mb-2">Custom Reason</Text>
                  <TextInput
                    value={logUsageForm.customReason}
                    onChangeText={(text) =>
                      setLogUsageForm((prev) => ({
                        ...prev,
                        customReason: text,
                      }))
                    }
                    placeholder="Describe the reason for this adjustment"
                    placeholderTextColor="#9CA3AF"
                    className="bg-[#212121] border border-gray-600 rounded-lg p-2 text-white text-base"
                  />
                </View>
              )}
            </View>

            <View className="mb-4">
              <Text className="text-base text-gray-300 mb-2">
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
                className="bg-[#212121] border border-gray-600 h-24 rounded-lg p-2 text-white text-base"
              />
            </View>

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setIsLogUsageModalOpen(false)}
                className="flex-1 py-2 px-3 bg-gray-600 rounded-lg"
              >
                <Text className="text-white text-base font-semibold text-center">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleLogUsage}
                className="flex-1 py-2 px-3 bg-red-600 rounded-lg"
              >
                <Text className="text-white text-base font-semibold text-center">
                  Log Usage
                </Text>
              </TouchableOpacity>
            </View>
            {showError.show && (
              <View className="mt-2 border border-red-500 rounded-lg p-2 bg-red-100 ">
                <Text className="text-red-500">{showError.title}</Text>
                <Text className="text-red-500">{showError.description}</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Add Stock Modal */}
      <Modal
        visible={isAddStockModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAddStockModalOpen(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="bg-[#303030] rounded-xl p-3 w-full max-w-md">
            <Text className="text-lg font-bold text-white mb-3">Add Stock</Text>

            <View className="mb-2">
              <Text className="text-base text-gray-300 mb-2">
                Item: {item.name}
              </Text>
            </View>

            <View className="mb-2">
              <Text className="text-base text-gray-300 mb-2">
                Quantity Added
              </Text>
              <TextInput
                value={addStockForm.quantityAdded}
                onChangeText={(text) =>
                  setAddStockForm((prev) => ({ ...prev, quantityAdded: text }))
                }
                placeholder="Enter quantity added"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                className="bg-[#212121] border border-gray-600 rounded-lg p-2 text-white text-base"
              />
            </View>

            <View className="mb-2">
              <Text className="text-base text-gray-300 mb-2">
                Reason for Addition
              </Text>
              <View className="bg-[#212121] border border-gray-600 rounded-lg">
                <TouchableOpacity
                  onPress={() =>
                    setAddStockForm((prev) => ({
                      ...prev,
                      reason: "PO_RECEIPT",
                    }))
                  }
                  className={`p-3 ${
                    addStockForm.reason === "PO_RECEIPT" ? "bg-blue-600" : ""
                  }`}
                >
                  <Text className="text-white">PO Receipt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    setAddStockForm((prev) => ({
                      ...prev,
                      reason: "COUNT_CORRECTION",
                    }))
                  }
                  className={`p-3 ${
                    addStockForm.reason === "COUNT_CORRECTION"
                      ? "bg-blue-600"
                      : ""
                  }`}
                >
                  <Text className="text-white">Count Correction</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    setAddStockForm((prev) => ({
                      ...prev,
                      reason: "INTERNAL_TRANSFER",
                    }))
                  }
                  className={`p-3 ${
                    addStockForm.reason === "INTERNAL_TRANSFER"
                      ? "bg-blue-600"
                      : ""
                  }`}
                >
                  <Text className="text-white">Internal Transfer</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View className="mb-4">
              <Text className="text-base text-gray-300 mb-2">
                Notes (Optional)
              </Text>
              <TextInput
                value={addStockForm.notes}
                onChangeText={(text) =>
                  setAddStockForm((prev) => ({ ...prev, notes: text }))
                }
                placeholder="Additional details..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                className="bg-[#212121] border border-gray-600 rounded-lg p-2 text-white text-base"
              />
            </View>

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setIsAddStockModalOpen(false)}
                className="flex-1 py-2 px-3 bg-gray-600 rounded-lg"
              >
                <Text className="text-white text-base font-semibold text-center">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddStock}
                className="flex-1 py-2 px-3 bg-green-600 rounded-lg"
              >
                <Text className="text-white text-base font-semibold text-center">
                  Add Stock
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
          <View className="flex-row items-center justify-between p-2 border-b border-gray-700">
            <Text className="text-lg font-bold text-white">
              Inventory History
            </Text>
            <TouchableOpacity onPress={() => historySheetRef.current?.close()}>
              <X color="#9CA3AF" size={20} />
            </TouchableOpacity>
          </View>

          {/* Custom Note Entry */}
          <View className="p-2 border-b border-gray-700">
            <Text className="text-gray-300 mb-2">Add Note to History</Text>
            <TextInput
              value={historyNote}
              onChangeText={setHistoryNote}
              placeholder="Type a note about this ingredient..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              className="bg-[#212121] border border-gray-600 rounded-lg p-2 text-white"
            />
            <View className="flex-row gap-2 mt-2">
              <TouchableOpacity
                onPress={() => setHistoryNote("")}
                className="px-3 py-2 bg-gray-600 rounded-lg"
              >
                <Text className="text-white font-semibold">Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (!item || !historyNote.trim()) return;
                  const newTransaction: InventoryTransaction = {
                    id: Date.now().toString(),
                    itemId: item.id,
                    type: "NOTE",
                    quantityChange: 0,
                    resultingQuantity: item.stockQuantity || 0,
                    reason: "Note",
                    notes: historyNote.trim(),
                    timestamp: new Date().toISOString(),
                    userId: "current_user",
                  };
                  setInventoryHistory((prev) => [newTransaction, ...prev]);
                  setHistoryNote("");
                }}
                className="px-3 py-2 bg-blue-600 rounded-lg"
              >
                <Text className="text-white font-semibold">Save Note</Text>
              </TouchableOpacity>
            </View>
          </View>

          {inventoryHistory.length === 0 ? (
            <View className="flex-1 justify-center items-center p-4">
              <History color="#9CA3AF" size={32} />
              <Text className="text-gray-400 text-base mt-3 text-center">
                No transaction history available
              </Text>
              <Text className="text-gray-500 text-sm mt-1 text-center">
                History will appear here once you log usage or adjustments.
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
                      className={`px-2 py-1 rounded ${getTransactionTypeColor(
                        transaction.type
                      )}`}
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
                    {transaction.type !== "NOTE" ? (
                      <>
                        <Text className="text-white font-semibold">
                          {transaction.quantityChange > 0 ? "+" : ""}
                          {transaction.quantityChange} {item.unit}
                        </Text>
                        <Text className="text-gray-300">
                          Result: {transaction.resultingQuantity}
                        </Text>
                      </>
                    ) : (
                      <Text className="text-gray-300 italic">Note entry</Text>
                    )}
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
    </View>
  );
};

export default IngredientItemScreen;
