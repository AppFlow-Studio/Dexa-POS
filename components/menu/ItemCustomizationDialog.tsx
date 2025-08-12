import { AddOn, CartItem, ItemSize, MenuItemType } from "@/lib/types";
import { useCartStore } from "@/stores/useCartStore";
import { Minus, Plus } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  onSave: (newItem: CartItem) => void;
}

const ItemCustomizationDialog: React.FC<ItemCustomizationDialogProps> = ({
  item,
  isVisible,
  onClose,
  onSave,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<ItemSize>({
    id: "default",
    name: "Regular",
    priceModifier: 0,
  });
  const [selectedAddOns, setSelectedAddOns] = useState<AddOn[]>([]);
  const [notes, setNotes] = useState("");

  const addItemToCart = useCartStore((state) => state.addItem);

  // Initialize state when item changes
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

  // Calculate total using useMemo for performance
  const total = useMemo(() => {
    if (!item) return 0;

    let baseTotal = item.price;
    if (selectedSize) {
      baseTotal += selectedSize.priceModifier;
    }
    selectedAddOns.forEach((addOn) => {
      baseTotal += addOn.price;
    });
    return baseTotal * quantity;
  }, [quantity, selectedSize, selectedAddOns, item]);

  const handleAddOnToggle = useCallback((addOn: AddOn) => {
    setSelectedAddOns((prev) =>
      prev.some((a) => a.id === addOn.id)
        ? prev.filter((a) => a.id !== addOn.id)
        : [...prev, addOn]
    );
  }, []);

  const handleAddToCart = useCallback(() => {
    if (!item) return;

    // Create the final item data object
    const newItem: CartItem = {
      id: `${item.id}_${Date.now()}`,
      menuItemId: item.id,
      name: item.name,
      quantity,
      originalPrice: item.price,
      price: total / quantity,
      image: item.image, // The image filename is now a top-level property
      customizations: {
        size: selectedSize,
        addOns: selectedAddOns,
        notes,
      },
      availableDiscount: item.availableDiscount,
      appliedDiscount: null,
    };

    // Call the onSave function passed down from the parent (MenuSection)
    onSave(newItem);
    onClose();
  }, [
    item,
    quantity,
    selectedSize,
    selectedAddOns,
    notes,
    total,
    onSave,
    onClose,
  ]);

  if (!item) return null;

  return (
    <Dialog open={isVisible} onOpenChange={onClose}>
      <DialogContent className="p-0 rounded-[36px] max-w-lg bg-accent-600 border-none">
        {/* Dark Header */}
        <View className="p-6 rounded-t-2xl flex-row items-center space-x-4">
          <Image
            source={require("@/assets/images/classic_burger.png")}
            className="w-24 h-24 rounded-lg"
          />
          <View className="flex-1">
            <DialogTitle className="text-[#F1F1F1] text-2xl font-bold">
              {item.name}
            </DialogTitle>
            <Text className="text-[#F1F1F1] mt-1 text-sm">
              {item.description}
            </Text>
            <Text className="text-[#F1F1F1] font-medium text-lg mt-2">
              ${item.price.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* White Content */}
        <View className="rounded-[36px] bg-neutral-100">
          <ScrollView className="p-6 max-h-96 ">
            <View className="flex-row justify-between items-center">
              <Text className="text-lg font-medium text-accent-500">Qty</Text>
              <View className="flex-row items-center space-x-4 rounded-full bg-neutral-200 border border-neutral-200">
                <TouchableOpacity
                  onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="p-2 border border-gray-300 rounded-full bg-white"
                >
                  <Minus color="#4b5563" size={20} />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-gray-800 w-8 text-center">
                  {quantity}
                </Text>
                <TouchableOpacity
                  onPress={() => setQuantity((q) => q + 1)}
                  className="p-2 bg-primary-400 rounded-full"
                >
                  <Plus color="#FFFFFF" size={20} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Sizes */}
            {item.sizes && (
              <View className="mt-4">
                <Text className="text-lg font-medium text-accent-500 mb-2">
                  Size
                </Text>
                <View className="flex-row gap-2 space-x-2">
                  {item.sizes.map((size) => {
                    const isSelected = selectedSize.id === size.id;
                    return (
                      <TouchableOpacity
                        key={size.id}
                        onPress={() => setSelectedSize(size)}
                        className={`w-[49%] p-3 rounded-xl border ${isSelected ? "border-[#659AF0] bg-[#659AF01F]" : "border-neutral-200"}`}
                      >
                        <View className="flex-row justify-between">
                          <Text className="font-semibold text-accent-500">
                            {size.name}
                          </Text>
                          <Text className="font-semibold text-accent-500">
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
                <Text className="text-lg font-medium text-accent-500 mb-">
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
                        className={`w-[49%] p-3 rounded-xl border ${isSelected ? "border-[#659AF0] bg-[#659AF01F]" : "border-neutral-200"}`}
                      >
                        <Text className="font-semibold text-accent-500">
                          {addOn.name} (+ ${addOn.price.toFixed(2)})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Notes */}
            <View className="my-4">
              <Text className="text-lg font-medium text-accent-500 mb-2">
                Notes
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Make the cheese more melted"
                multiline
                className="p-3 border border-gray-300 rounded-lg h-20"
              />
            </View>
          </ScrollView>

          <DialogFooter className="p-6 flex-row justify-between items-center border-t border-gray-200 bg-neutral-100 rounded-b-[36px]">
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
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default ItemCustomizationDialog;
