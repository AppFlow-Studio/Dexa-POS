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
      // Pre-fill form for editing
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
      // Reset form for adding
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
    // Shared validation
    if (initialData?.isGlobal) {
      // Global Save (Location Settings)
      const currentStock = parseFloat(stockQuantity) || 0;
      const initialStock = initialData.stockQuantity || 0;
      const stockChanged = currentStock !== initialStock;

      if (stockChanged && !stockUpdateReason.trim()) {
        alert("Please provide a reason for the stock change.");
        return;
      }

      onSave(
        {
          name: initialData.name, // Keep existing
          category: initialData.category,
          stockQuantity: currentStock,
          unit: initialData.unit,
          unitType: initialData.unitType,
          // Overrides passed as standard fields (store maps them)
          reorderThreshold: parseFloat(reorderThreshold) || 0,
          cost: parseFloat(cost) || 0,
          vendorId: initialData.vendorId, // Keep global vendor
          stockTrackingMode: "quantity",
          locationId: initialData.locationId ?? null,
          stockUpdateReason: stockUpdateReason, // New field for audit
        },
        initialData.id
      );
    } else {
      // Local Save (Full Edit)
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

  // Render Global Form (Location Settings)
  if (initialData?.isGlobal) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="bg-panel border-border w-[550px]">
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <DialogHeader>
              <View className="flex-row items-center gap-2">
                <DialogTitle className="text-white text-2xl">
                  Edit Location Settings
                </DialogTitle>
                <View className="px-2 py-0.5 bg-blue-500/20 rounded-full border border-blue-500/50">
                  <Text className="text-blue-400 text-xs font-semibold">
                    Global
                  </Text>
                </View>
              </View>
              <View className="mt-2 p-3 bg-blue-900/20 border border-blue-800 rounded-lg">
                <Text className="text-blue-300 text-sm">
                  This is a global item. You can only update stock and apply
                  local overrides for cost and reorder thresholds.
                </Text>
              </View>
            </DialogHeader>

            <View className="py-4 gap-y-4">
              {/* Read-Only Info */}
              <View className="flex-row gap-4">
                <View className="flex-1">
                  <Text className="text-gray-400 mb-1">Item Name</Text>
                  <View className="p-3 bg-screen border border-border rounded-lg">
                    <Text className="text-gray-300">{initialData.name}</Text>
                  </View>
                </View>
                <View className="w-1/3">
                  <Text className="text-gray-400 mb-1">Unit</Text>
                  <View className="p-3 bg-screen border border-border rounded-lg">
                    <Text className="text-gray-300">{initialData.unit}</Text>
                  </View>
                </View>
              </View>

              {/* Stock Management */}
              <View className="p-4 bg-screen/50 border border-border rounded-xl space-y-3">
                <Text className="text-gray-200 font-semibold">
                  Location Stock
                </Text>
                <View className="flex-row gap-4">
                  <View className="flex-1">
                    <Text className="text-gray-400 mb-1">Quantity</Text>
                    <TextInput
                      value={stockQuantity}
                      onChangeText={setStockQuantity}
                      keyboardType="numeric"
                      className="p-3 bg-screen border border-border rounded-lg text-white"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-400 mb-1">
                      Reorder Threshold
                    </Text>
                    <TextInput
                      value={reorderThreshold}
                      onChangeText={setReorderThreshold}
                      placeholder={String(initialData.reorderThreshold)}
                      placeholderTextColor={colors.muted}
                      keyboardType="numeric"
                      className="p-3 bg-screen border border-border rounded-lg text-white"
                    />
                    <Text className="text-xs text-gray-500 mt-1">
                      Override default ({initialData.reorderThreshold})
                    </Text>
                  </View>
                </View>

                {/* Conditional Reason Input */}
                {parseFloat(stockQuantity) !==
                  (initialData.stockQuantity || 0) && (
                  <View>
                    <Text className="text-gray-400 mb-1">
                      Reason for Change *
                    </Text>
                    <TextInput
                      value={stockUpdateReason}
                      onChangeText={setStockUpdateReason}
                      placeholder="e.g. Received delivery, Spoilage..."
                      placeholderTextColor={colors.muted}
                      className="p-3 bg-screen border border-border rounded-lg text-white"
                    />
                  </View>
                )}
              </View>

              {/* Cost Override */}
              <View className="p-4 bg-screen/50 border border-border rounded-xl">
                <View className="flex-row justify-between mb-2">
                  <Text className="text-gray-200 font-semibold">Pricing</Text>
                  <Text className="text-gray-400 text-sm">
                    Base Cost: ${initialData.cost.toFixed(2)}
                  </Text>
                </View>
                <View>
                  <Text className="text-gray-400 mb-1">Cost Override ($)</Text>
                  <TextInput
                    value={cost}
                    onChangeText={setCost}
                    placeholder="Set custom cost..."
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    className="p-3 bg-screen border border-border rounded-lg text-white"
                  />
                </View>
              </View>
            </View>

            <DialogFooter className="flex-row gap-2 mt-2">
              <TouchableOpacity
                onPress={onClose}
                className="flex-1 py-3 bg-screen border border-border rounded-lg"
              >
                <Text className="text-center text-lg font-bold text-gray-300">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                className="flex-1 py-3 bg-blue-600 rounded-lg"
              >
                <Text className="text-center text-lg font-bold text-white">
                  Save Changes
                </Text>
              </TouchableOpacity>
            </DialogFooter>
          </ScrollView>
        </DialogContent>
      </Dialog>
    );
  }

  // Render Local Form (Full Edit - Existing Code Wrapped)
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-panel border-border w-[550px]">
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <DialogHeader>
            <DialogTitle className="text-white text-2xl">
              {initialData ? "Edit" : "Add New"} Inventory Item
            </DialogTitle>
          </DialogHeader>
          <View className="py-3 gap-y-3">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-lg text-gray-300 font-medium mb-1.5">
                  Item Name
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  className="p-3 bg-screen border border-border rounded-lg text-lg text-white h-16"
                />
              </View>
              <View className="flex-1">
                <Text className="text-lg text-gray-300 font-medium mb-1.5">
                  Category
                </Text>
                <TextInput
                  value={category}
                  onChangeText={setCategory}
                  className="p-3 bg-screen border border-border rounded-lg text-lg text-white h-16"
                />
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-lg text-gray-300 font-medium mb-1.5">
                  Stock Quantity
                </Text>
                <TextInput
                  value={stockQuantity}
                  onChangeText={setStockQuantity}
                  keyboardType="numeric"
                  className="p-3 bg-screen border border-border rounded-lg text-lg text-white h-16"
                />
              </View>
              <View className="flex-1">
                <Text className="text-lg text-gray-300 font-medium mb-1.5">
                  Unit
                </Text>
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger className="w-full p-3 h-16 bg-screen border border-border rounded-lg">
                    <SelectValue
                      className="text-lg text-white"
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
                          <Text className="text-lg">{opt.label}</Text>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-lg text-gray-300 font-medium mb-1.5">
                  Reorder Threshold
                </Text>
                <TextInput
                  value={reorderThreshold}
                  onChangeText={setReorderThreshold}
                  keyboardType="numeric"
                  className="p-3 bg-screen border border-border rounded-lg text-lg text-white h-16"
                />
              </View>
              <View className="flex-1">
                <Text className="text-lg text-gray-300 font-medium mb-1.5">
                  Cost Per Unit
                </Text>
                <TextInput
                  value={cost}
                  onChangeText={setCost}
                  keyboardType="numeric"
                  className="p-3 bg-screen border border-border rounded-lg text-lg text-white h-16"
                />
              </View>
            </View>
            <View>
              <Text className="text-lg text-gray-300 font-medium mb-1.5">
                Default Vendor
              </Text>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger className="w-full p-3 h-16 bg-screen border border-border rounded-lg">
                  <SelectValue
                    className="text-lg text-white"
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
                        <Text className="text-lg">{opt.label}</Text>
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
              className="flex-1 py-3 bg-screen border border-border rounded-lg"
            >
              <Text className="text-center text-lg font-bold text-gray-300">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              className="flex-1 py-3 bg-blue-600 rounded-lg"
            >
              <Text className="text-center text-lg font-bold text-white">
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
