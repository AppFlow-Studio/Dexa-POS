import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { colors } from "@/lib/theme";
import { InventoryItem, Vendor } from "@/lib/types";
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface InventoryItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<InventoryItem, "id">, id?: string) => void;
  vendors: Vendor[];
  initialData?: InventoryItem | null;
}

export const UNIT_OPTIONS: { label: string; value: string }[] = [
  { label: "Pieces (pcs)", value: "pcs" },
  { label: "Grams (g)", value: "g" },
  { label: "Kilograms (kg)", value: "kg" },
  { label: "Ounces (oz)", value: "oz" },
  { label: "Pounds (lbs)", value: "lbs" },
  { label: "Milliliters (ml)", value: "ml" },
  { label: "Liters (l)", value: "l" },
  { label: "Bottle", value: "bottle" },
  { label: "Bag", value: "bag" },
  { label: "Pound (lb)", value: "lb" },
  { label: "Head", value: "head" },
  { label: "Can", value: "can" },
  { label: "Container", value: "container" },
  { label: "Bunch", value: "bunch" },
  { label: "Box", value: "box" },
  { label: "Jar", value: "jar" },
  { label: "Quart (qt)", value: "qt" },
  { label: "Gallon (gal)", value: "gal" },
  { label: "Loaf", value: "loaf" },
  { label: "Pint", value: "pint" },
  { label: "Package (pkg)", value: "pkg" },
];

const inputStyle = {
  backgroundColor: colors.screen,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 8,
  color: colors.heading,
  fontSize: 14,
  height: 40,
  paddingHorizontal: 12,
};

const fieldLabel = {
  fontSize: 12,
  color: colors.label,
  marginBottom: 6,
};

const InventoryItemFormModal: React.FC<InventoryItemFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  vendors,
  initialData,
}) => {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [stockQuantity, setStockQuantity] = useState("0");
  const [unit, setUnit] = useState<any>();
  const [reorderThreshold, setReorderThreshold] = useState("0");
  const [cost, setCost] = useState("0");
  const [vendorId, setVendorId] = useState<any>();
  const [stockUpdateReason, setStockUpdateReason] = useState("");

  useEffect(() => {
    if (isOpen && initialData) {
      setName(initialData.name);
      setCategory(initialData.category);
      setStockQuantity(String(initialData.stockQuantity));
      setUnit(UNIT_OPTIONS.find((u) => u.value === initialData.unit));
      setReorderThreshold(String(initialData.reorderThreshold));
      setCost(String(initialData.cost));
      setVendorId(
        vendors
          .map((v) => ({ label: v.name, value: v.id }))
          .find((v) => v.value === initialData.vendorId)
      );
      setStockUpdateReason("");
    } else {
      setName("");
      setCategory("");
      setStockQuantity("0");
      setUnit(undefined);
      setReorderThreshold("0");
      setCost("0");
      setVendorId(undefined);
      setStockUpdateReason("");
    }
  }, [initialData, isOpen, vendors]);

  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };
  const vendorOptions = vendors.map((v) => ({ label: v.name, value: v.id }));

  const handleSave = () => {
    if (initialData?.isGlobal) {
      const currentStock = parseFloat(stockQuantity) || 0;
      const initialStock = initialData.stockQuantity || 0;
      const stockChanged = currentStock !== initialStock;

      if (stockChanged && !stockUpdateReason.trim()) {
        alert("Please provide a reason for the stock change.");
        return;
      }

      onSave(
        {
          name: initialData.name,
          category: initialData.category,
          stockQuantity: currentStock,
          unit: initialData.unit,
          unitType: initialData.unitType,
          reorderThreshold: parseFloat(reorderThreshold) || 0,
          cost: parseFloat(cost) || 0,
          vendorId: initialData.vendorId,
          stockTrackingMode: "quantity",
          locationId: initialData.locationId ?? null,
          stockUpdateReason: stockUpdateReason,
        },
        initialData.id
      );
    } else {
      if (!name || !category || !unit) {
        alert("Please fill all required fields.");
        return;
      }

      let unitType: "unit" | "weight" | "volume" = "unit";
      const uVal = unit.value.toLowerCase();
      if (["kg", "g", "lb", "lbs", "oz"].includes(uVal)) unitType = "weight";
      if (["l", "ml", "gal", "qt", "pint"].includes(uVal)) unitType = "volume";

      const currentStock = parseFloat(stockQuantity) || 0;
      const initialStock = initialData?.stockQuantity || 0;
      const stockChanged = currentStock !== initialStock;

      onSave(
        {
          name,
          category,
          stockQuantity: currentStock,
          unit: unit.value,
          unitType,
          reorderThreshold: parseFloat(reorderThreshold) || 0,
          cost: parseFloat(cost) || 0,
          vendorId: vendorId?.value || null,
          stockTrackingMode: "quantity",
          locationId: initialData?.locationId ?? null,
          stockUpdateReason: stockChanged
            ? stockUpdateReason || "Manual Adjustment"
            : undefined,
        },
        initialData?.id
      );
    }
    onClose();
  };

  // Global form
  if (initialData?.isGlobal) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent
          className="w-[500px]"
          style={{ backgroundColor: colors.panel, borderColor: colors.border }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <DialogHeader>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <DialogTitle style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
                  Edit Location Settings
                </DialogTitle>
                <View
                  style={{
                    backgroundColor: colors.info + "20",
                    borderWidth: 1,
                    borderColor: colors.info + "50",
                    borderRadius: 20,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "600", color: colors.info }}>
                    Global
                  </Text>
                </View>
              </View>
              <View
                style={{
                  marginTop: 8,
                  backgroundColor: colors.info + "10",
                  borderWidth: 1,
                  borderColor: colors.info + "30",
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                <Text style={{ fontSize: 12, color: colors.info }}>
                  This is a global item. You can only update stock and apply local overrides for
                  cost and reorder thresholds.
                </Text>
              </View>
            </DialogHeader>

            <View style={{ paddingVertical: 14, gap: 12 }}>
              {/* Read-Only Info */}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={fieldLabel}>Item Name</Text>
                  <View
                    style={{
                      padding: 10,
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      height: 40,
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 13, color: colors.heading }}>{initialData.name}</Text>
                  </View>
                </View>
                <View style={{ width: "33%" }}>
                  <Text style={fieldLabel}>Unit</Text>
                  <View
                    style={{
                      padding: 10,
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      height: 40,
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 13, color: colors.heading }}>{initialData.unit}</Text>
                  </View>
                </View>
              </View>

              {/* Stock Management */}
              <View
                style={{
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  padding: 12,
                  gap: 10,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                  Location Stock
                </Text>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Quantity</Text>
                    <TextInput
                      value={stockQuantity}
                      onChangeText={setStockQuantity}
                      keyboardType="numeric"
                      style={inputStyle}
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Reorder Threshold</Text>
                    <TextInput
                      value={reorderThreshold}
                      onChangeText={setReorderThreshold}
                      placeholder={String(initialData.reorderThreshold)}
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                      style={inputStyle}
                    />
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
                      Override default ({initialData.reorderThreshold})
                    </Text>
                  </View>
                </View>

                {parseFloat(stockQuantity) !== (initialData.stockQuantity || 0) && (
                  <View>
                    <Text style={fieldLabel}>Reason for Change *</Text>
                    <TextInput
                      value={stockUpdateReason}
                      onChangeText={setStockUpdateReason}
                      placeholder="e.g. Received delivery, Spoilage..."
                      placeholderTextColor={colors.muted}
                      style={inputStyle}
                    />
                  </View>
                )}
              </View>

              {/* Cost Override */}
              <View
                style={{
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  padding: 12,
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                    Pricing
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.label }}>
                    Base Cost: ${initialData.cost.toFixed(2)}
                  </Text>
                </View>
                <View>
                  <Text style={fieldLabel}>Cost Override ($)</Text>
                  <TextInput
                    value={cost}
                    onChangeText={setCost}
                    placeholder="Set custom cost..."
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    style={inputStyle}
                  />
                </View>
              </View>
            </View>

            <DialogFooter className="flex-row gap-2 mt-2">
              <TouchableOpacity
                onPress={onClose}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.label }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  backgroundColor: colors.teal + "20",
                  borderWidth: 1,
                  borderColor: colors.teal + "50",
                  borderRadius: 8,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.teal }}>
                  Save Changes
                </Text>
              </TouchableOpacity>
            </DialogFooter>
          </ScrollView>
        </DialogContent>
      </Dialog>
    );
  }

  // Local form
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="w-[500px]"
        style={{ backgroundColor: colors.panel, borderColor: colors.border }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <DialogHeader>
            <DialogTitle style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
              {initialData ? "Edit" : "Add New"} Inventory Item
            </DialogTitle>
          </DialogHeader>
          <View style={{ paddingVertical: 12, gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Item Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  style={inputStyle}
                  placeholderTextColor={colors.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Category</Text>
                <TextInput
                  value={category}
                  onChangeText={setCategory}
                  style={inputStyle}
                  placeholderTextColor={colors.muted}
                />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Stock Quantity</Text>
                <TextInput
                  value={stockQuantity}
                  onChangeText={setStockQuantity}
                  keyboardType="numeric"
                  style={inputStyle}
                  placeholderTextColor={colors.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Unit</Text>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger
                    className="w-full"
                    style={{
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      height: 40,
                      paddingHorizontal: 12,
                    }}
                  >
                    <SelectValue
                      style={{ fontSize: 14, color: colors.heading }}
                      placeholder="Select a unit..."
                    />
                  </SelectTrigger>
                  <SelectContent insets={contentInsets}>
                    <SelectGroup>
                      {UNIT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} label={opt.label} value={opt.value}>
                          <Text style={{ fontSize: 13 }}>{opt.label}</Text>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Reorder Threshold</Text>
                <TextInput
                  value={reorderThreshold}
                  onChangeText={setReorderThreshold}
                  keyboardType="numeric"
                  style={inputStyle}
                  placeholderTextColor={colors.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Cost Per Unit</Text>
                <TextInput
                  value={cost}
                  onChangeText={setCost}
                  keyboardType="numeric"
                  style={inputStyle}
                  placeholderTextColor={colors.muted}
                />
              </View>
            </View>
            <View>
              <Text style={fieldLabel}>Default Vendor</Text>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger
                  className="w-full"
                  style={{
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    height: 40,
                    paddingHorizontal: 12,
                  }}
                >
                  <SelectValue
                    style={{ fontSize: 14, color: colors.heading }}
                    placeholder="Select a vendor..."
                  />
                </SelectTrigger>
                <SelectContent insets={contentInsets}>
                  <SelectGroup>
                    {vendorOptions.map((opt) => (
                      <SelectItem key={opt.value} label={opt.label} value={opt.value}>
                        <Text style={{ fontSize: 13 }}>{opt.label}</Text>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </View>
          </View>
          <DialogFooter className="flex-row gap-2">
            <TouchableOpacity
              onPress={onClose}
              style={{
                flex: 1,
                paddingVertical: 9,
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.label }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={{
                flex: 1,
                paddingVertical: 9,
                backgroundColor: colors.teal + "20",
                borderWidth: 1,
                borderColor: colors.teal + "50",
                borderRadius: 8,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.teal }}>
                Save Item
              </Text>
            </TouchableOpacity>
          </DialogFooter>
        </ScrollView>
      </DialogContent>
    </Dialog>
  );
};

export default InventoryItemFormModal;
