import { AddOn, ItemSize, MenuItemType } from "@/lib/types";
import { useCartStore } from "@/stores/useCartStore";
import { Minus, Plus } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "../ui/dialog";

interface ItemCustomizationDialogProps {
  item: MenuItemType | null;
  isVisible: boolean;
  onClose: () => void;
}

const ItemCustomizationDialog: React.FC<ItemCustomizationDialogProps> = ({
  item,
  isVisible,
  onClose,
}) => {
  if (!item) return null;

  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<ItemSize>(
    item.sizes?.[0] || { id: "default", name: "Regular", priceModifier: 0 }
  );
  const [selectedAddOns, setSelectedAddOns] = useState<AddOn[]>([]);
  const [notes, setNotes] = useState("");
  const [total, setTotal] = useState(item.price);

  const addItemToCart = useCartStore((state) => state.addItem);

  // Recalculate total whenever options change
  useEffect(() => {
    let newTotal = item.price;
    if (selectedSize) {
      newTotal += selectedSize.priceModifier;
    }
    selectedAddOns.forEach((addOn) => {
      newTotal += addOn.price;
    });
    setTotal(newTotal * quantity);
  }, [quantity, selectedSize, selectedAddOns, item]);

  // Reset state when a new item is passed in
  useEffect(() => {
    if (item) {
      setQuantity(1);
      setSelectedSize(
        item.sizes?.[0] || { id: "default", name: "Regular", priceModifier: 0 }
      );
      setSelectedAddOns([]);
      setNotes("");
    }
  }, [item]);

  const handleAddOnToggle = (addOn: AddOn) => {
    setSelectedAddOns((prev) =>
      prev.some((a) => a.id === addOn.id)
        ? prev.filter((a) => a.id !== addOn.id)
        : [...prev, addOn]
    );
  };

  const handleAddToCart = () => {
    addItemToCart({
      menuItem: item,
      quantity,
      size: selectedSize,
      addOns: selectedAddOns,
      notes,
      finalPrice: total / quantity,
    });
    onClose();
  };

  return (
    <Dialog open={isVisible} onOpenChange={onClose}>
      <DialogContent className="p-0 rounded-2xl max-w-lg bg-neutral-100">
        {/* Dark Header */}
        <View className="bg-gray-800 p-6 rounded-t-2xl flex-row items-center space-x-4">
          <Image
            source={require("@/assets/images/classic_burger.png")}
            className="w-24 h-24 rounded-lg"
          />
          <View className="flex-1">
            <DialogTitle className="text-white text-2xl font-bold">
              {item.name}
            </DialogTitle>
            <Text className="text-gray-300 mt-1">{item.description}</Text>
            <Text className="text-white font-bold text-lg mt-2">
              ${item.price.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* White Content */}
        <ScrollView className="p-6 max-h-96 bg-neutral-100">
          <View className="flex-row justify-between items-center">
            <Text className="text-lg font-bold text-gray-700">Qty</Text>
            <View className="flex-row items-center space-x-4">
              <TouchableOpacity
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                className="p-2 border border-gray-300 rounded-md"
              >
                <Minus color="#4b5563" size={20} />
              </TouchableOpacity>
              <Text className="text-xl font-bold text-gray-800 w-8 text-center">
                {quantity}
              </Text>
              <TouchableOpacity
                onPress={() => setQuantity((q) => q + 1)}
                className="p-2 bg-primary-400 rounded-md"
              >
                <Plus color="#FFFFFF" size={20} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Sizes */}
          {item.sizes && (
            <View className="mt-4">
              <Text className="text-lg font-bold text-gray-700 mb-2">Size</Text>
              <View className="flex-row space-x-2">
                {item.sizes.map((size) => {
                  const isSelected = selectedSize.id === size.id;
                  return (
                    <TouchableOpacity
                      key={size.id}
                      onPress={() => setSelectedSize(size)}
                      className={`flex-1 p-3 rounded-lg border ${isSelected ? "border-primary-400 bg-primary-100" : "border-gray-300"}`}
                    >
                      <View className="flex-row justify-between">
                        <Text
                          className={`font-semibold ${isSelected ? "text-primary-400" : "text-gray-700"}`}
                        >
                          {size.name}
                        </Text>
                        <Text
                          className={`font-semibold ${isSelected ? "text-primary-400" : "text-gray-500"}`}
                        >
                          + ${size.priceModifier.toFixed(2)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Add-ons */}
          {item.addOns && (
            <View className="mt-4">
              <Text className="text-lg font-bold text-gray-700 mb-2">
                Add-ons
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {item.addOns.map((addOn) => {
                  const isSelected = selectedAddOns.some(
                    (a) => a.id === addOn.id
                  );
                  return (
                    <TouchableOpacity
                      key={addOn.id}
                      onPress={() => handleAddOnToggle(addOn)}
                      className={`p-3 rounded-lg border ${isSelected ? "border-primary-400 bg-primary-100" : "border-gray-300"}`}
                    >
                      <Text
                        className={`font-semibold ${isSelected ? "text-primary-400" : "text-gray-700"}`}
                      >
                        {addOn.name} (+ ${addOn.price.toFixed(2)})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Notes */}
          <View className="mt-4">
            <Text className="text-lg font-bold text-gray-700 mb-2">Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Make the cheese more melted"
              multiline
              className="p-3 border border-gray-300 rounded-lg h-20"
            />
          </View>
        </ScrollView>

        <DialogFooter className="p-6 flex-row justify-between items-center border-t border-gray-200 bg-neutral-100">
          <View>
            <Text className="text-sm text-gray-500">Total</Text>
            <Text className="text-2xl font-bold text-gray-800">
              ${total.toFixed(2)}
            </Text>
          </View>
          <View className="flex-row space-x-2">
            <TouchableOpacity
              onPress={onClose}
              className="px-8 py-3 rounded-lg border border-gray-300"
            >
              <Text className="font-bold text-gray-700">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAddToCart}
              className="px-8 py-3 rounded-lg bg-primary-400"
            >
              <Text className="font-bold text-white">Add</Text>
            </TouchableOpacity>
          </View>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ItemCustomizationDialog;
