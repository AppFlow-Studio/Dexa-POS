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
import { useUiScale } from "@/lib/uiScale";
import { InventoryItem, Vendor } from "@/lib/types";
import { useColorScheme } from "@/lib/useColorScheme";
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

const getInputStyle = (s: (n: number) => number) => ({
  backgroundColor: colors.screen,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: s(8),
  color: colors.heading,
  fontSize: s(14),
  height: s(40),
  paddingHorizontal: s(12),
});

const getFieldLabel = (s: (n: number) => number) => ({
  fontSize: s(12),
  color: colors.label,
  marginBottom: s(6),
});

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
  const { colorScheme } = useColorScheme();
  const keyboardAppearance = colorScheme === "dark" ? "dark" : "light";
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const inputStyle = getInputStyle(s);
  const fieldLabel = getFieldLabel(s);

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
          .find((v) => v.value === initialData.vendorId),
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
          vendorId: vendorId?.value ?? initialData.vendorId,
          stockTrackingMode: "quantity",
          locationId: initialData.locationId ?? null,
          stockUpdateReason: stockUpdateReason,
        },
        initialData.id,
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
        initialData?.id,
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
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}
              >
                <DialogTitle
                  style={{
                    fontSize: s(15),
                    fontWeight: "700",
                    color: colors.heading,
                  }}
                >
                  Edit Location Settings
                </DialogTitle>
                <View
                  style={{
                    backgroundColor: colors.info + "20",
                    borderWidth: 1,
                    borderColor: colors.info + "50",
                    borderRadius: s(20),
                    paddingHorizontal: s(8),
                    paddingVertical: s(2),
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(11),
                      fontWeight: "600",
                      color: colors.info,
                    }}
                  >
                    Global
                  </Text>
                </View>
              </View>
              <View
                style={{
                  marginTop: s(8),
                  backgroundColor: colors.info + "10",
                  borderWidth: 1,
                  borderColor: colors.info + "30",
                  borderRadius: s(8),
                  padding: s(10),
                }}
              >
                <Text style={{ fontSize: s(12), color: colors.info }}>
                  This is a global item. You can only update stock and apply
                  local overrides for cost and reorder thresholds.
                </Text>
              </View>
            </DialogHeader>

            <View style={{ paddingVertical: s(14), gap: s(12) }}>
              {/* Read-Only Info */}
              <View style={{ flexDirection: "row", gap: s(12) }}>
                <View style={{ flex: 1 }}>
                  <Text style={fieldLabel}>Item Name</Text>
                  <View
                    style={{
                      padding: s(10),
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: s(8),
                      height: s(40),
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: s(13), color: colors.heading }}>
                      {initialData.name}
                    </Text>
                  </View>
                </View>
                <View style={{ width: "33%" }}>
                  <Text style={fieldLabel}>Unit</Text>
                  <View
                    style={{
                      padding: s(10),
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: s(8),
                      height: s(40),
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: s(13), color: colors.heading }}>
                      {initialData.unit}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Stock Management */}
              <View
                style={{
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: s(10),
                  padding: s(12),
                  gap: s(10),
                }}
              >
                <Text
                  style={{
                    fontSize: s(13),
                    fontWeight: "600",
                    color: colors.heading,
                  }}
                >
                  Location Stock
                </Text>
                <View style={{ flexDirection: "row", gap: s(12) }}>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Quantity</Text>
                    <TextInput
                      value={stockQuantity}
                      onChangeText={setStockQuantity}
                      keyboardType="numeric"
                      keyboardAppearance={keyboardAppearance}
                      selectionColor={colors.teal}
                      cursorColor={colors.teal}
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
                      keyboardAppearance={keyboardAppearance}
                      selectionColor={colors.teal}
                      cursorColor={colors.teal}
                      style={inputStyle}
                    />
                    <Text
                      style={{
                        fontSize: s(11),
                        color: colors.muted,
                        marginTop: s(4),
                      }}
                    >
                      Override default ({initialData.reorderThreshold})
                    </Text>
                  </View>
                </View>

                {parseFloat(stockQuantity) !==
                  (initialData.stockQuantity || 0) && (
                  <View>
                    <Text style={fieldLabel}>Reason for Change *</Text>
                    <TextInput
                      value={stockUpdateReason}
                      onChangeText={setStockUpdateReason}
                      placeholder="e.g. Received delivery, Spoilage..."
                      placeholderTextColor={colors.muted}
                      keyboardAppearance={keyboardAppearance}
                      selectionColor={colors.teal}
                      cursorColor={colors.teal}
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
                  borderRadius: s(10),
                  padding: s(12),
                  gap: s(8),
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(13),
                      fontWeight: "600",
                      color: colors.heading,
                    }}
                  >
                    Pricing
                  </Text>
                  <Text style={{ fontSize: s(12), color: colors.label }}>
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
                    keyboardAppearance={keyboardAppearance}
                    selectionColor={colors.teal}
                    cursorColor={colors.teal}
                    style={inputStyle}
                  />
                </View>
              </View>
            </View>

            {/* Vendor */}
            <View style={{ marginBottom: s(4) }}>
              <Text style={fieldLabel}>Vendor</Text>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger
                  className="w-full"
                  style={{
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: s(8),
                    height: s(40),
                    paddingHorizontal: s(12),
                  }}
                >
                  <SelectValue
                    style={{ fontSize: s(14), color: colors.heading }}
                    placeholder="Select a vendor..."
                  />
                </SelectTrigger>
                <SelectContent insets={contentInsets}>
                  <SelectGroup>
                    {vendorOptions.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        label={opt.label}
                        value={opt.value}
                      >
                        <Text style={{ fontSize: s(13) }}>{opt.label}</Text>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </View>

            <DialogFooter className="flex-row gap-2 mt-2">
              <TouchableOpacity
                onPress={onClose}
                style={{
                  flex: 1,
                  paddingVertical: s(9),
                  backgroundColor: "transparent",
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
                onPress={handleSave}
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
            <DialogTitle
              style={{ fontSize: s(15), fontWeight: "700", color: colors.heading }}
            >
              {initialData ? "Edit" : "Add New"} Inventory Item
            </DialogTitle>
          </DialogHeader>
          <View style={{ paddingVertical: s(12), gap: s(10) }}>
            <View style={{ flexDirection: "row", gap: s(10) }}>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Item Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  keyboardAppearance={keyboardAppearance}
                  selectionColor={colors.teal}
                  cursorColor={colors.teal}
                  style={inputStyle}
                  placeholderTextColor={colors.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Category</Text>
                <TextInput
                  value={category}
                  onChangeText={setCategory}
                  keyboardAppearance={keyboardAppearance}
                  selectionColor={colors.teal}
                  cursorColor={colors.teal}
                  style={inputStyle}
                  placeholderTextColor={colors.muted}
                />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: s(10) }}>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Stock Quantity</Text>
                <TextInput
                  value={stockQuantity}
                  onChangeText={setStockQuantity}
                  keyboardType="numeric"
                  keyboardAppearance={keyboardAppearance}
                  selectionColor={colors.teal}
                  cursorColor={colors.teal}
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
                      borderRadius: s(8),
                      height: s(40),
                      paddingHorizontal: s(12),
                    }}
                  >
                    <SelectValue
                      style={{ fontSize: s(14), color: colors.heading }}
                      placeholder="Select a unit..."
                    />
                  </SelectTrigger>
                  <SelectContent insets={contentInsets}>
                    <SelectGroup>
                      {UNIT_OPTIONS.map((opt) => (
                        <SelectItem
                          key={opt.value}
                          label={opt.label}
                          value={opt.value}
                        >
                          <Text style={{ fontSize: s(13) }}>{opt.label}</Text>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: s(10) }}>
              <View style={{ flex: 1 }}>
                <Text style={fieldLabel}>Reorder Threshold</Text>
                <TextInput
                  value={reorderThreshold}
                  onChangeText={setReorderThreshold}
                  keyboardType="numeric"
                  keyboardAppearance={keyboardAppearance}
                  selectionColor={colors.teal}
                  cursorColor={colors.teal}
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
                  keyboardAppearance={keyboardAppearance}
                  selectionColor={colors.teal}
                  cursorColor={colors.teal}
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
                    borderRadius: s(8),
                    height: s(40),
                    paddingHorizontal: s(12),
                  }}
                >
                  <SelectValue
                    style={{ fontSize: s(14), color: colors.heading }}
                    placeholder="Select a vendor..."
                  />
                </SelectTrigger>
                <SelectContent insets={contentInsets}>
                  <SelectGroup>
                    {vendorOptions.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        label={opt.label}
                        value={opt.value}
                      >
                        <Text style={{ fontSize: s(13) }}>{opt.label}</Text>
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
                paddingVertical: s(9),
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: s(8),
                alignItems: "center",
              }}
            >
              <Text
                style={{ fontSize: s(13), fontWeight: "600", color: colors.label }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
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
                style={{ fontSize: s(13), fontWeight: "600", color: colors.teal }}
              >
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
