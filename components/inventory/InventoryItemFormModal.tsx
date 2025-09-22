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
import { InventoryItem, InventoryUnit, Vendor } from "@/lib/types";
import React, { useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface InventoryItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<InventoryItem, "id">, id?: string) => void;
  vendors: Vendor[];
  initialData?: InventoryItem | null;
}

export const UNIT_OPTIONS: { label: string; value: InventoryUnit }[] = [
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
    } else {
      // Reset form for adding
      setName("");
      setCategory("");
      setStockQuantity("0");
      setUnit(undefined);
      setReorderThreshold("0");
      setCost("0");
      setVendorId(undefined);
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
    if (!name || !category || !unit) {
      alert("Please fill all required fields.");
      return;
    }
    onSave(
      {
        name,
        category,
        stockQuantity: parseFloat(stockQuantity) || 0,
        unit: unit.value,
        reorderThreshold: parseFloat(reorderThreshold) || 0,
        cost: parseFloat(cost) || 0,
        vendorId: vendorId?.value || null,
      },
      initialData?.id
    );
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#303030] border-gray-700 w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-white text-3xl">
            {initialData ? "Edit" : "Add New"} Inventory Item
          </DialogTitle>
        </DialogHeader>
        <View className="py-4 gap-y-4">
          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text className="text-xl text-gray-300 font-medium mb-2">
                Item Name
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                className="p-4 bg-[#212121] border border-gray-600 rounded-lg text-2xl text-white h-20"
              />
            </View>
            <View className="flex-1">
              <Text className="text-xl text-gray-300 font-medium mb-2">
                Category
              </Text>
              <TextInput
                value={category}
                onChangeText={setCategory}
                className="p-4 bg-[#212121] border border-gray-600 rounded-lg text-2xl text-white h-20"
              />
            </View>
          </View>
          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text className="text-xl text-gray-300 font-medium mb-2">
                Stock Quantity
              </Text>
              <TextInput
                value={stockQuantity}
                onChangeText={setStockQuantity}
                keyboardType="numeric"
                className="p-4 bg-[#212121] border border-gray-600 rounded-lg text-2xl text-white h-20"
              />
            </View>
            <View className="flex-1">
              <Text className="text-xl text-gray-300 font-medium mb-2">
                Unit
              </Text>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="w-full p-4 min-h-16 bg-[#212121] border border-gray-600 rounded-lg">
                  <SelectValue
                    className="text-2xl text-white"
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
                        <Text className="text-2xl">{opt.label}</Text>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </View>
          </View>
          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text className="text-xl text-gray-300 font-medium mb-2">
                Reorder Threshold
              </Text>
              <TextInput
                value={reorderThreshold}
                onChangeText={setReorderThreshold}
                keyboardType="numeric"
                className="p-4 bg-[#212121] border border-gray-600 rounded-lg text-2xl text-white h-20"
              />
            </View>
            <View className="flex-1">
              <Text className="text-xl text-gray-300 font-medium mb-2">
                Cost Per Unit
              </Text>
              <TextInput
                value={cost}
                onChangeText={setCost}
                keyboardType="numeric"
                className="p-4 bg-[#212121] border border-gray-600 rounded-lg text-2xl text-white h-20"
              />
            </View>
          </View>
          <View>
            <Text className="text-xl text-gray-300 font-medium mb-2">
              Default Vendor
            </Text>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger className="w-full p-4 bg-[#212121] min-h-16 border border-gray-600 rounded-lg">
                <SelectValue
                  className="text-2xl text-white"
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
                      <Text className="text-2xl">{opt.label}</Text>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </View>
        </View>
        <DialogFooter className="flex-row gap-3">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-4 bg-[#212121] border border-gray-600 rounded-lg"
          >
            <Text className="text-center text-2xl font-bold text-gray-300">
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            className="flex-1 py-4 bg-blue-600 rounded-lg"
          >
            <Text className="text-center text-2xl font-bold text-white">
              Save Item
            </Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InventoryItemFormModal;
