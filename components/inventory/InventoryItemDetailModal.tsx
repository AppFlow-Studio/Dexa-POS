import { colors } from "@/lib/theme";
import { InventoryItem } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { useInventoryStore } from "@/stores/useInventoryStore";
import {
  AlertTriangle,
  CheckCircle,
  Edit,
  Minus,
  Plus,
  Save,
  X,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

const InventoryItemDetailModal: React.FC<{
  isOpen: boolean;
  itemId: string | null;
  onClose: () => void;
  onUpdate: (
    id: string,
    data: Partial<InventoryItem>,
    storeId?: string,
  ) => Promise<void>;
}> = ({ isOpen, itemId, onClose, onUpdate }) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const { height: windowHeight } = useWindowDimensions();

  const inputStyle = (editable: boolean) =>
    ({
      backgroundColor: editable ? colors.screen : colors.card,
      borderWidth: 1,
      borderColor: editable ? colors.border : "transparent",
      borderRadius: s(6),
      color: editable ? colors.heading : colors.label,
      fontSize: s(12),
      paddingHorizontal: s(8),
      paddingVertical: s(6),
      textAlignVertical: "center" as const,
    }) as any;

  const fieldLabel = {
    fontSize: s(9),
    fontWeight: "600" as const,
    color: colors.muted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.3,
  };

  const { inventoryItems, vendors } = useInventoryStore();
  const item = useMemo(
    () => (itemId ? inventoryItems.find((i) => i.id === itemId) : null),
    [itemId, inventoryItems],
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editStockTrackingMode, setEditStockTrackingMode] = useState<
    "in_stock" | "out_of_stock" | "quantity"
  >("quantity");
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
  const [isLogUsageModalOpen, setIsLogUsageModalOpen] = useState(false);
  const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false);
  const [logUsageForm, setLogUsageForm] = useState({
    quantityUsed: "",
    reason: "",
    customReason: "",
    notes: "",
  });
  const [addStockForm, setAddStockForm] = useState({
    quantityAdded: "",
    reason: "",
    notes: "",
  });

  React.useEffect(() => {
    if (item) {
      setEditForm({
        name: item.name,
        sku: "",
        category: item.category,
        defaultVendor: item.vendorId || "",
        unitOfMeasure: item.unit,
        stockQuantity: item.stockQuantity?.toString() || "",
        reorderThreshold: item.reorderThreshold?.toString() || "",
        cost: item.cost?.toString() || "",
      });
      setEditStockTrackingMode((item as any).stockTrackingMode || "quantity");
    }
  }, [item, isOpen]);

  const handleSave = async () => {
    if (!item) return;
    const roundedStockQuantity =
      editForm.stockQuantity !== ""
        ? Number(parseFloat(editForm.stockQuantity).toFixed(2))
        : item.stockQuantity;
    const stockChanged = roundedStockQuantity !== item.stockQuantity;
    const quantityFields =
      editStockTrackingMode === "quantity"
        ? {
            stockQuantity: roundedStockQuantity,
            reorderThreshold: editForm.reorderThreshold
              ? parseInt(editForm.reorderThreshold)
              : item.reorderThreshold,
          }
        : { stockQuantity: undefined, reorderThreshold: undefined };
    const updatedItem = {
      ...item,
      name: editForm.name,
      category: editForm.category,
      vendorId: editForm.defaultVendor || null,
      unit: editForm.unitOfMeasure as any,
      ...(quantityFields as any),
      stockTrackingMode: editStockTrackingMode,
      cost: editForm.cost ? parseFloat(editForm.cost) : item.cost,
      stockUpdateReason: stockChanged ? "Manual Adjustment" : undefined,
    };
    try {
      await onUpdate(item.id, updatedItem);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save inventory item:", error);
      alert("Failed to save item changes.");
    }
  };

  const handleLogUsage = async () => {
    if (!item) return;
    if (!logUsageForm.quantityUsed) {
      alert("Enter the quantity used.");
      return;
    }
    if (!logUsageForm.reason) {
      alert("Select a reason.");
      return;
    }
    if (trackingMode !== "quantity") {
      alert("This item is not set to track stock by quantity.");
      return;
    }
    const quantityUsed = parseFloat(logUsageForm.quantityUsed);
    if (!Number.isFinite(quantityUsed) || quantityUsed <= 0) {
      alert("Enter a valid quantity greater than 0.");
      return;
    }
    const quantityChange = -quantityUsed;
    const newQuantity = Number(
      ((item.stockQuantity || 0) + quantityChange).toFixed(2),
    );
    const updatedItem = {
      ...item,
      stockQuantity: newQuantity,
      stockUpdateReason: logUsageForm.reason,
    };
    try {
      await onUpdate(item.id, updatedItem);
      setLogUsageForm({
        quantityUsed: "",
        reason: "",
        customReason: "",
        notes: "",
      });
      setIsLogUsageModalOpen(false);
    } catch (error) {
      console.error("Failed to log inventory usage:", error);
      alert("Failed to log usage.");
    }
  };

  const handleAddStock = async () => {
    if (!item) return;
    if (!addStockForm.quantityAdded) {
      alert("Enter the quantity added.");
      return;
    }
    if (!addStockForm.reason) {
      alert("Select a reason.");
      return;
    }
    if (trackingMode !== "quantity") {
      alert("This item is not set to track stock by quantity.");
      return;
    }
    const quantityChange = parseFloat(addStockForm.quantityAdded);
    if (!Number.isFinite(quantityChange) || quantityChange <= 0) {
      alert("Enter a valid quantity greater than 0.");
      return;
    }
    const newQuantity = Number(
      ((item.stockQuantity || 0) + quantityChange).toFixed(2),
    );
    const updatedItem = {
      ...item,
      stockQuantity: newQuantity,
      stockUpdateReason: addStockForm.reason,
    };
    try {
      await onUpdate(item.id, updatedItem);
      setAddStockForm({ quantityAdded: "", reason: "", notes: "" });
      setIsAddStockModalOpen(false);
    } catch (error) {
      console.error("Failed to add stock:", error);
      alert("Failed to add stock.");
    }
  };

  const getVendorName = (vendorId?: string | null) => {
    if (!vendorId) return "No vendor";
    const vendor = vendors.find((v) => v.id === vendorId);
    return vendor ? vendor.name : "Unknown vendor";
  };

  const trackingMode =
    (item as any)?.stockTrackingMode || editStockTrackingMode;
  const isLowStock =
    item &&
    item.stockQuantity !== undefined &&
    item.reorderThreshold !== undefined &&
    item.stockQuantity <= item.reorderThreshold;

  if (!item) return null;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{
            width: "100%",
            maxWidth: s(420),
            maxHeight: windowHeight * 0.85,
          }}
        >
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: s(12),
              marginHorizontal: s(16),
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
              maxHeight: windowHeight * 0.85,
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: s(10),
                paddingVertical: s(8),
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                backgroundColor: colors.panel,
              }}
            >
              <TouchableOpacity onPress={onClose} style={{ padding: s(4) }}>
                <X size={s(14)} color={colors.muted} />
              </TouchableOpacity>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: s(13),
                  fontWeight: "600",
                  color: colors.heading,
                  flex: 1,
                  marginHorizontal: s(8),
                }}
              >
                {item.name}
              </Text>
              <TouchableOpacity
                onPress={isEditing ? handleSave : () => setIsEditing(true)}
                style={{
                  paddingHorizontal: s(10),
                  paddingVertical: s(5),
                  backgroundColor: colors.teal + "20",
                  borderWidth: 1,
                  borderColor: colors.teal + "50",
                  borderRadius: s(6),
                }}
              >
                {isEditing ? (
                  <Save size={s(12)} color={colors.teal} />
                ) : (
                  <Edit size={s(12)} color={colors.teal} />
                )}
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: s(8), gap: s(6) }}>
              {/* Overview Card */}
              <View
                style={{
                  backgroundColor: colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: s(10),
                  padding: s(10),
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: s(8),
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(12),
                      fontWeight: "600",
                      color: colors.heading,
                    }}
                  >
                    Stock Info
                  </Text>
                  {isLowStock ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: s(3),
                      }}
                    >
                      <AlertTriangle size={s(11)} color={colors.danger} />
                      <Text
                        style={{
                          fontSize: s(9),
                          color: colors.danger,
                          fontWeight: "600",
                        }}
                      >
                        Low
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: s(3),
                      }}
                    >
                      <CheckCircle size={s(11)} color={colors.teal} />
                      <Text
                        style={{
                          fontSize: s(9),
                          color: colors.teal,
                          fontWeight: "600",
                        }}
                      >
                        OK
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ gap: s(6) }}>
                  {[
                    {
                      label: "Stock",
                      value:
                        trackingMode === "quantity"
                          ? `${item.stockQuantity ?? 0} ${item.unit}`
                          : trackingMode === "in_stock"
                            ? "In Stock"
                            : "Out of Stock",
                      accent:
                        trackingMode === "in_stock"
                          ? colors.success
                          : trackingMode === "out_of_stock"
                            ? colors.danger
                            : undefined,
                    },
                    ...(trackingMode === "quantity"
                      ? [
                          {
                            label: "Reorder",
                            value: `${item.reorderThreshold || "—"} ${item.unit}`,
                          },
                        ]
                      : []),
                    {
                      label: "Cost",
                      value: `$${item.cost?.toFixed(2) || "0.00"}`,
                    },
                    { label: "Vendor", value: getVendorName(item.vendorId) },
                    { label: "Category", value: item.category || "—" },
                  ].map((row) => (
                    <View
                      key={row.label}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ fontSize: s(11), color: colors.label }}>
                        {row.label}
                      </Text>
                      <Text
                        style={{
                          fontSize: s(11),
                          fontWeight: "600",
                          color: (row as any).accent || colors.heading,
                        }}
                      >
                        {row.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Quick Actions */}
              <View style={{ flexDirection: "row", gap: s(6) }}>
                <TouchableOpacity
                  onPress={() => setIsLogUsageModalOpen(true)}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: s(4),
                    paddingVertical: s(6),
                    backgroundColor: colors.danger + "15",
                    borderWidth: 1,
                    borderColor: colors.danger + "30",
                    borderRadius: s(8),
                  }}
                >
                  <Minus size={s(12)} color={colors.danger} />
                  <Text
                    style={{
                      fontSize: s(11),
                      fontWeight: "600",
                      color: colors.danger,
                    }}
                  >
                    Log Usage
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setIsAddStockModalOpen(true)}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: s(4),
                    paddingVertical: s(6),
                    backgroundColor: colors.teal + "15",
                    borderWidth: 1,
                    borderColor: colors.teal + "30",
                    borderRadius: s(8),
                  }}
                >
                  <Plus size={s(12)} color={colors.teal} />
                  <Text
                    style={{
                      fontSize: s(11),
                      fontWeight: "600",
                      color: colors.teal,
                    }}
                  >
                    Add Stock
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Item Details Form */}
              <View
                style={{
                  backgroundColor: colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: s(10),
                  padding: s(10),
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: s(8),
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(11),
                      fontWeight: "600",
                      color: colors.muted,
                    }}
                  >
                    Details
                  </Text>
                  {isEditing && (
                    <TouchableOpacity
                      onPress={() => setIsEditing(false)}
                      style={{ padding: s(3) }}
                    >
                      <X size={s(11)} color={colors.muted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Stock Tracking Mode */}
                <View style={{ marginBottom: s(8) }}>
                  <Text style={{ ...fieldLabel, marginBottom: s(4) }}>
                    Tracking Mode
                  </Text>
                  <View style={{ flexDirection: "row", gap: s(4) }}>
                    {(["in_stock", "out_of_stock", "quantity"] as const).map(
                      (mode) => {
                        const isActive = editStockTrackingMode === mode;
                        const label =
                          mode === "in_stock"
                            ? "In Stock"
                            : mode === "out_of_stock"
                              ? "Out"
                              : "Qty";
                        return (
                          <TouchableOpacity
                            key={mode}
                            disabled={!isEditing}
                            onPress={() => setEditStockTrackingMode(mode)}
                            style={{
                              flex: 1,
                              paddingVertical: s(5),
                              alignItems: "center",
                              borderRadius: s(6),
                              borderWidth: 1,
                              backgroundColor: isActive
                                ? colors.teal + "20"
                                : "transparent",
                              borderColor: isActive
                                ? colors.teal + "50"
                                : colors.border,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: s(10),
                                fontWeight: "600",
                                color: isActive ? colors.teal : colors.label,
                              }}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      },
                    )}
                  </View>
                </View>

                {/* Fields 2-col */}
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...fieldLabel, marginBottom: 3 }}>Name</Text>
                    <TextInput
                      value={editForm.name}
                      onChangeText={(t) =>
                        setEditForm((p) => ({ ...p, name: t }))
                      }
                      editable={isEditing}
                      style={{ ...inputStyle(isEditing), height: 38 }}
                      placeholder="Item name"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...fieldLabel, marginBottom: 3 }}>
                      Category
                    </Text>
                    <TextInput
                      value={editForm.category}
                      onChangeText={(t) =>
                        setEditForm((p) => ({ ...p, category: t }))
                      }
                      editable={isEditing}
                      style={{ ...inputStyle(isEditing), height: 38 }}
                      placeholder="Produce"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...fieldLabel, marginBottom: 3 }}>Unit</Text>
                    <TextInput
                      value={editForm.unitOfMeasure}
                      onChangeText={(t) =>
                        setEditForm((p) => ({ ...p, unitOfMeasure: t }))
                      }
                      editable={isEditing}
                      style={{ ...inputStyle(isEditing), height: 38 }}
                      placeholder="kg, pcs"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...fieldLabel, marginBottom: 3 }}>Cost</Text>
                    <TextInput
                      value={editForm.cost}
                      onChangeText={(t) =>
                        setEditForm((p) => ({ ...p, cost: t }))
                      }
                      editable={isEditing}
                      keyboardType="numeric"
                      style={{ ...inputStyle(isEditing), height: 38 }}
                      placeholder="0.00"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                </View>

                {editStockTrackingMode === "quantity" && (
                  <View
                    style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...fieldLabel, marginBottom: 3 }}>
                        Qty
                      </Text>
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
                        style={{ ...inputStyle(isEditing), height: 38 }}
                        placeholder="0"
                        placeholderTextColor={colors.muted}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...fieldLabel, marginBottom: 3 }}>
                        Reorder
                      </Text>
                      <TextInput
                        value={editForm.reorderThreshold}
                        onChangeText={(t) =>
                          setEditForm((p) => ({
                            ...p,
                            reorderThreshold: t.replace(/[^0-9.]/g, ""),
                          }))
                        }
                        editable={isEditing}
                        keyboardType="numeric"
                        style={{ ...inputStyle(isEditing), height: 38 }}
                        placeholder="0"
                        placeholderTextColor={colors.muted}
                      />
                    </View>
                  </View>
                )}

                <View style={{ marginBottom: 6 }}>
                  <Text style={{ ...fieldLabel, marginBottom: 3 }}>SKU</Text>
                  <TextInput
                    value={editForm.sku}
                    onChangeText={(t) => setEditForm((p) => ({ ...p, sku: t }))}
                    editable={isEditing}
                    style={{ ...inputStyle(isEditing), height: 38 }}
                    placeholder="SKU or barcode"
                    placeholderTextColor={colors.muted}
                  />
                </View>

                <View>
                  <Text style={{ ...fieldLabel, marginBottom: 4 }}>Vendor</Text>
                  {isEditing ? (
                    <View
                      style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}
                    >
                      <TouchableOpacity
                        onPress={() =>
                          setEditForm((p) => ({ ...p, defaultVendor: "" }))
                        }
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 6,
                          borderWidth: 1,
                          backgroundColor: !editForm.defaultVendor
                            ? colors.teal + "20"
                            : "transparent",
                          borderColor: !editForm.defaultVendor
                            ? colors.teal + "50"
                            : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            color: !editForm.defaultVendor
                              ? colors.teal
                              : colors.label,
                            fontWeight: !editForm.defaultVendor ? "600" : "400",
                          }}
                        >
                          None
                        </Text>
                      </TouchableOpacity>
                      {vendors.map((v) => {
                        const isActive = editForm.defaultVendor === v.id;
                        return (
                          <TouchableOpacity
                            key={v.id}
                            onPress={() =>
                              setEditForm((p) => ({
                                ...p,
                                defaultVendor: v.id,
                              }))
                            }
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 6,
                              borderWidth: 1,
                              backgroundColor: isActive
                                ? colors.teal + "20"
                                : "transparent",
                              borderColor: isActive
                                ? colors.teal + "50"
                                : colors.border,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                color: isActive ? colors.teal : colors.label,
                                fontWeight: isActive ? "600" : "400",
                              }}
                            >
                              {v.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text
                      style={{
                        fontSize: 12,
                        color: editForm.defaultVendor
                          ? colors.heading
                          : colors.muted,
                      }}
                    >
                      {editForm.defaultVendor
                        ? (vendors.find((v) => v.id === editForm.defaultVendor)
                            ?.name ?? "Unknown")
                        : "No vendor"}
                    </Text>
                  )}
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* Log Usage Modal */}
      <Modal
        visible={isLogUsageModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsLogUsageModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: 12,
              marginHorizontal: 16,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
              width: "100%",
              maxWidth: 380,
            }}
          >
            <View
              style={{
                padding: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: colors.heading,
                  marginBottom: 2,
                }}
              >
                Log Usage
              </Text>
              <Text style={{ fontSize: 11, color: colors.label }}>
                {item?.name}
              </Text>
            </View>
            <View style={{ padding: 10, gap: 10 }}>
              <View>
                <Text style={{ ...fieldLabel, marginBottom: 3 }}>
                  Quantity Used
                </Text>
                <TextInput
                  value={logUsageForm.quantityUsed}
                  onChangeText={(t) =>
                    setLogUsageForm((p) => ({ ...p, quantityUsed: t }))
                  }
                  placeholder="Enter quantity"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  style={{ ...inputStyle(true), height: 38 }}
                />
              </View>
              <View>
                <Text style={{ ...fieldLabel, marginBottom: 3 }}>Reason</Text>
                <View style={{ gap: 4 }}>
                  {[
                    { key: "SALES_CONSUMPTION", label: "Sales / Consumption" },
                    { key: "SPOILAGE_WASTE", label: "Spoilage / Waste" },
                    { key: "INTERNAL_TRANSFER", label: "Internal Transfer" },
                    { key: "COUNT_CORRECTION", label: "Count Correction" },
                  ].map((opt) => {
                    const isActive = logUsageForm.reason === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        onPress={() =>
                          setLogUsageForm((p) => ({ ...p, reason: opt.key }))
                        }
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 6,
                          borderWidth: 1,
                          backgroundColor: isActive
                            ? colors.teal + "20"
                            : "transparent",
                          borderColor: isActive
                            ? colors.teal + "50"
                            : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            color: isActive ? colors.teal : colors.label,
                            fontWeight: isActive ? "600" : "400",
                          }}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <TouchableOpacity
                  onPress={() => setIsLogUsageModalOpen(false)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    backgroundColor: "transparent",
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
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
                    paddingVertical: 8,
                    backgroundColor: colors.danger + "20",
                    borderWidth: 1,
                    borderColor: colors.danger + "30",
                    borderRadius: 8,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: colors.danger,
                    }}
                  >
                    Log
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
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
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: colors.panel,
              borderRadius: 12,
              marginHorizontal: 16,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
              width: "100%",
              maxWidth: 380,
            }}
          >
            <View
              style={{
                padding: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: colors.heading,
                  marginBottom: 2,
                }}
              >
                Add Stock
              </Text>
              <Text style={{ fontSize: 11, color: colors.label }}>
                {item?.name}
              </Text>
            </View>
            <View style={{ padding: 10, gap: 10 }}>
              <View>
                <Text style={{ ...fieldLabel, marginBottom: 3 }}>
                  Quantity Added
                </Text>
                <TextInput
                  value={addStockForm.quantityAdded}
                  onChangeText={(t) =>
                    setAddStockForm((p) => ({ ...p, quantityAdded: t }))
                  }
                  placeholder="Enter quantity"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  style={{ ...inputStyle(true), height: 38 }}
                />
              </View>
              <View>
                <Text style={{ ...fieldLabel, marginBottom: 3 }}>Reason</Text>
                <View style={{ gap: 4 }}>
                  {[
                    { key: "PO_RECEIPT", label: "PO Receipt" },
                    { key: "COUNT_CORRECTION", label: "Count Correction" },
                    { key: "INTERNAL_TRANSFER", label: "Internal Transfer" },
                  ].map((opt) => {
                    const isActive = addStockForm.reason === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        onPress={() =>
                          setAddStockForm((p) => ({ ...p, reason: opt.key }))
                        }
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 6,
                          borderWidth: 1,
                          backgroundColor: isActive
                            ? colors.teal + "20"
                            : "transparent",
                          borderColor: isActive
                            ? colors.teal + "50"
                            : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            color: isActive ? colors.teal : colors.label,
                            fontWeight: isActive ? "600" : "400",
                          }}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <TouchableOpacity
                  onPress={() => setIsAddStockModalOpen(false)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    backgroundColor: "transparent",
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: colors.label,
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddStock}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    backgroundColor: colors.teal + "20",
                    borderWidth: 1,
                    borderColor: colors.teal + "30",
                    borderRadius: 8,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: colors.teal,
                    }}
                  >
                    Add
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

export default InventoryItemDetailModal;
