import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InventoryItemStatus } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Plus, Upload } from "lucide-react-native";
import React, { useState } from "react";
import {
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// A simplified preview component to show what the menu item will look like
const MenuItemPreview = ({ name, image }: { name: string; image?: string }) => (
  <View className="w-full p-4 rounded-lg bg-red-50 border border-gray-200">
    <View className="flex-row items-center gap-2">
      {image ? (
        <Image source={{ uri: image }} className="w-16 h-16 rounded-lg" />
      ) : (
        <View className="w-16 h-16 rounded-lg bg-gray-200" />
      )}
      <View className="flex-1">
        <Text className="text-base font-bold text-gray-800">
          {name || "Item Name"}
        </Text>
        <Text className="text-base font-semibold text-gray-700">$ 0.00</Text>
      </View>
    </View>
    <TouchableOpacity className="w-full mt-4 py-3 rounded-xl items-center justify-center bg-blue-100">
      <View className="flex-row items-center">
        <Plus color="#3D72C2" size={16} strokeWidth={3} />
        <Text className="text-blue-600 font-bold ml-1.5">Add to Cart</Text>
      </View>
    </TouchableOpacity>
  </View>
);

// Define the type for our select options
type SelectOption = { label: string; value: string };

const AddItemScreen = () => {
  const router = useRouter();
  const { addItem } = useInventoryStore();

  const [itemName, setItemName] = useState("");
  const [description, setDescription] = useState("");
  //  Define the state type for the select components
  const [category, setCategory] = useState<SelectOption | undefined>();
  const [modifier, setModifier] = useState<SelectOption | undefined>();
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState<SelectOption | undefined>();
  const [availability, setAvailability] = useState(true);

  // Convert string arrays to object arrays for the Select component
  const CATEGORY_OPTIONS: SelectOption[] = [
    "Appetizers",
    "Main Course",
    "Sides",
    "Drinks",
    "Dessert",
    "Pastries",
    "Breads",
  ].map((val) => ({ label: val, value: val }));
  const MODIFIER_OPTIONS: SelectOption[] = [
    "None",
    "Cheese",
    "Sauce",
    "Spicy",
    "Glaze",
  ].map((val) => ({ label: val, value: val }));
  const UNIT_OPTIONS: SelectOption[] = ["PCs", "KGs", "Liters"].map((val) => ({
    label: val,
    value: val,
  }));

  const handleAddItem = () => {
    // Add validation for undefined select values
    if (!itemName || !category?.value || !stock || !unit?.value) {
      toast.error("Please fill in all required fields.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    // Extract the .value from the selected objects before saving
    addItem({
      name: itemName,
      description,
      category: category.value,
      modifier: modifier?.value || "None", // Default to "None" if not selected
      stock: parseInt(stock, 10),
      unit: unit.value as "PCs" | "KGs" | "Liters",
      availability,
      status:
        parseInt(stock, 10) > 0
          ? "Active"
          : ("Out of Stock" as InventoryItemStatus),
    });

    toast.success(`${itemName} has been added to inventory.`, {
      position: ToastPosition.BOTTOM,
    });
    router.back();
  };

  return (
    <ScrollView className="flex-1 bg-white p-6">
      <Text className="text-3xl font-bold text-gray-800 mb-6">
        Inventory / Add Item
      </Text>
      <View className="flex-row gap-6">
        {/* Left Column: Form */}
        <View className="flex-1 space-y-4">
          <View>
            <Text className="font-bold mb-2 text-gray-700">Item Image</Text>
            <TouchableOpacity className="border-2 border-dashed border-gray-300 rounded-lg h-40 items-center justify-center">
              <Upload color="#6b7280" size={32} />
              <Text className="text-gray-500 mt-2">Click to upload</Text>
              <Text className="text-xs text-gray-400">JPG, PNG (Max 2 MB)</Text>
            </TouchableOpacity>
          </View>

          <View>
            <Text className="font-bold mb-2 text-gray-700">Item Name</Text>
            <TextInput
              value={itemName}
              onChangeText={setItemName}
              className="p-3 bg-gray-50 border border-gray-200 rounded-lg"
              placeholder="e.g., Cheese Burger"
            />
          </View>

          <View>
            <Text className="font-bold mb-2 text-gray-700">Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              className="p-3 bg-gray-50 border border-gray-200 rounded-lg h-24"
              placeholder="Add description here"
            />
          </View>

          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text className="font-bold mb-2 text-gray-700">Category</Text>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        label={opt.label}
                        value={opt.value}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </View>
            <View className="flex-1">
              <Text className="font-bold mb-2 text-gray-700">Modifier</Text>
              <Select value={modifier} onValueChange={setModifier}>
                <SelectTrigger className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {MODIFIER_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        label={opt.label}
                        value={opt.value}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </View>
          </View>

          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text className="font-bold mb-2 text-gray-700">Stock</Text>
              <TextInput
                value={stock}
                onChangeText={setStock}
                keyboardType="numeric"
                className="p-3 bg-gray-50 border border-gray-200 rounded-lg"
                placeholder="e.g., 25"
              />
            </View>
            <View className="flex-1">
              <Text className="font-bold mb-2 text-gray-700">Unit</Text>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {UNIT_OPTIONS.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        label={opt.label}
                        value={opt.value}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </View>
          </View>

          <View>
            <Text className="font-bold mb-2 text-gray-700">Availability</Text>
            <View className="flex-row items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <Text className="text-gray-600">
                Enable and show this product in the menu
              </Text>
              <Switch
                value={availability}
                onValueChange={setAvailability}
                trackColor={{ false: "#DCDCDC", true: "#34D399" }}
                thumbColor={"#ffffff"}
              />
            </View>
          </View>
        </View>

        {/* Right Column: Preview */}
        <View className="flex-1">
          <Text className="font-bold mb-2 text-gray-700">Preview</Text>
          <MenuItemPreview name={itemName} />
        </View>
      </View>

      {/* Footer Actions */}
      <View className="flex-row gap-4 mt-8 mb-12 border-t border-gray-200 pt-4">
        <TouchableOpacity
          onPress={() => router.back()}
          className="px-8 py-3 bg-white border border-gray-300 rounded-lg"
        >
          <Text className="font-bold text-gray-700">Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleAddItem}
          className="px-8 py-3 bg-primary-400 rounded-lg"
        >
          <Text className="font-bold text-white">Add</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default AddItemScreen;
