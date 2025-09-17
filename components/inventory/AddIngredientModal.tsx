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
import { RecipeItem } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface AddIngredientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddIngredient: (ingredient: RecipeItem) => void;
}

type SelectOption = { label: string; value: string };

const AddIngredientModal: React.FC<AddIngredientModalProps> = ({
  isOpen,
  onClose,
  onAddIngredient,
}) => {
  const inventoryItems = useInventoryStore((state) => state.inventoryItems);
  const [selectedItem, setSelectedItem] = useState<SelectOption | undefined>();
  const [quantity, setQuantity] = useState("1");

  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };

  const inventoryOptions: SelectOption[] = inventoryItems.map((item) => ({
    label: `${item.name} (${item.unit})`,
    value: item.id,
  }));

  const handleAdd = () => {
    if (!selectedItem || !quantity) {
      alert("Please select an item and enter a quantity.");
      return;
    }
    onAddIngredient({
      inventoryItemId: selectedItem.value,
      quantity: parseFloat(quantity) || 1,
    });
    setSelectedItem(undefined);
    setQuantity("1");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#303030] border-gray-700 w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-3xl text-white">
            Add Ingredient
          </DialogTitle>
        </DialogHeader>
        <View className="py-4 gap-y-4">
          <View>
            <Text className="text-2xl text-gray-300 font-medium mb-2">
              Inventory Item
            </Text>
            {/* --- MODIFIED: The onValueChange now correctly receives the full option object --- */}
            <Select value={selectedItem} onValueChange={setSelectedItem}>
              <SelectTrigger className="w-full p-4 bg-[#212121] border border-gray-600 rounded-lg">
                <SelectValue
                  className="text-2xl text-white"
                  placeholder="Select an item..."
                />
              </SelectTrigger>
              <SelectContent insets={contentInsets}>
                <ScrollView>
                  <SelectGroup>
                    {inventoryOptions.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        label={opt.label}
                        value={opt.value} // Pass the whole object
                      >
                        <Text className="text-2xl">{opt.label}</Text>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </ScrollView>
              </SelectContent>
            </Select>
          </View>
          <View>
            <Text className="text-2xl text-gray-300 font-medium mb-2">
              Quantity
            </Text>
            <TextInput
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
              className="p-4 bg-[#212121] border border-gray-600 rounded-lg text-2xl text-white"
            />
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
            onPress={handleAdd}
            className="flex-1 py-4 bg-blue-600 rounded-lg"
          >
            <Text className="text-center text-2xl font-bold text-white">
              Add
            </Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddIngredientModal;
