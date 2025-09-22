import { AddOn, CartItem, ItemSize } from "@/lib/types";
import { useCustomizationStore } from "@/stores/useCustomizationStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Minus, Plus } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "../ui/dialog";

const ItemCustomizationDialog: React.FC = () => {
  const { isOpen, mode, menuItem, cartItem, close } = useCustomizationStore();
  const { addItemToActiveOrder, updateItemInActiveOrder, generateCartItemId } =
    useOrderStore();

  // Internal state for the form
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<ItemSize | undefined>();
  const [selectedAddOns, setSelectedAddOns] = useState<AddOn[]>([]);
  const [notes, setNotes] = useState("");

  const isReadOnly = mode === "view";

  // Effect to populate the form when the dialog opens
  useEffect(() => {
    if (isOpen) {
      const itemToLoad = mode === "edit" ? cartItem : menuItem;
      if (itemToLoad) {
        setQuantity(mode === "edit" ? cartItem!.quantity : 1);
        setSelectedSize(
          mode === "edit" ? cartItem!.customizations.size : menuItem!.sizes?.[0]
        );
        setSelectedAddOns(
          mode === "edit" ? cartItem!.customizations.addOns || [] : []
        );
        setNotes(mode === "edit" ? cartItem!.customizations.notes || "" : "");
      }
    }
  }, [isOpen, mode, menuItem, cartItem]);

  // Calculate total using useMemo for performance
  const total = useMemo(() => {
    if (!menuItem) return 0;

    let baseTotal = menuItem.price;
    if (selectedSize) {
      baseTotal += selectedSize.priceModifier;
    }
    selectedAddOns.forEach((addOn) => {
      baseTotal += addOn.price;
    });
    return baseTotal * quantity;
  }, [quantity, selectedSize, selectedAddOns, menuItem]);

  const handleAddOnToggle = useCallback((addOn: AddOn) => {
    setSelectedAddOns((prev) =>
      prev.some((a) => a.id === addOn.id)
        ? prev.filter((a) => a.id !== addOn.id)
        : [...prev, addOn]
    );
  }, []);

  const handleSave = useCallback(() => {
    if (!menuItem) return;

    if (mode === "edit" && cartItem) {
      // If in edit mode, create an updated version of the existing cartItem
      const updatedItem: CartItem = {
        ...cartItem,
        quantity,
        price: total / quantity,
        customizations: { size: selectedSize, addOns: selectedAddOns, notes },
      };
      updateItemInActiveOrder(updatedItem);
    } else {
      // If in add mode, create a brand new CartItem
      const newItem: CartItem = {
        id: generateCartItemId(menuItem.id, {
          size: selectedSize,
          addOns: selectedAddOns,
          notes,
        }),
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity,
        originalPrice: menuItem.price,
        price: total / quantity, // includes size/add-ons
        image: menuItem.image,
        customizations: { size: selectedSize, addOns: selectedAddOns, notes },
        availableDiscount: menuItem.availableDiscount,
        appliedDiscount: null,
        paidQuantity: 0,
      };
      addItemToActiveOrder(newItem);
    }
    // Trigger the toast notification with the item's details
    toast.success(`${menuItem.name} $${total.toFixed(2)} added`, {
      duration: 4000, // Show for 4 seconds
      position: ToastPosition.BOTTOM,
    });

    close();
  }, [
    menuItem,
    cartItem,
    mode,
    quantity,
    selectedSize,
    selectedAddOns,
    notes,
    total,
    close,
    addItemToActiveOrder,
    updateItemInActiveOrder,
  ]);

  if (!isOpen || !menuItem) return null;

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="p-0 rounded-[36px] max-w-xl bg-[#11111A] border-none">
        {/* Dark Header */}
        <View className="p-6 rounded-t-2xl flex-row items-center gap-4">
          <Image
            source={require("@/assets/images/classic_burger.png")}
            className="w-24 h-24 rounded-lg"
          />
          <View className="flex-1">
            <DialogTitle className="text-[#F1F1F1] text-2xl font-bold">
              {menuItem.name}
            </DialogTitle>
            <Text className="text-[#F1F1F1] mt-1 text-sm">
              {menuItem.description}
            </Text>
            <Text className="text-[#F1F1F1] font-medium text-lg mt-2">
              ${menuItem.price.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* White Content */}
        <View className="rounded-[36px] p-6 bg-background-100">
          <View className="flex-row justify-between items-center">
            <Text className="text-lg font-medium text-accent-500">Qty</Text>
            <View className="flex-row items-center gap-4 rounded-full bg-neutral-200 border border-neutral-200">
              <TouchableOpacity
                disabled={isReadOnly}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                className="p-2 border border-gray-300 rounded-full bg-white"
              >
                <Minus color="#4b5563" size={20} />
              </TouchableOpacity>
              <Text className="text-xl font-bold text-gray-800 w-8 text-center">
                {quantity}
              </Text>
              <TouchableOpacity
                disabled={isReadOnly}
                onPress={() => setQuantity((q) => q + 1)}
                className="p-2 bg-primary-400 rounded-full"
              >
                <Plus color="#FFFFFF" size={20} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Sizes */}
          {menuItem.sizes && (
            <View className="mt-4">
              <Text className="text-lg font-medium text-accent-500 mb-2">
                Size
              </Text>
              <View className="flex-row gap-2">
                {menuItem.sizes.map((size) => {
                  const isSelected = selectedSize?.id === size.id;
                  return (
                    <TouchableOpacity
                      disabled={isReadOnly}
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
          {menuItem.addOns && (
            <View className="mt-4">
              <Text className="text-lg font-medium text-accent-500 mb-">
                Add-ons
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {menuItem.addOns.map((addOn) => {
                  const isSelected = selectedAddOns.some(
                    (a) => a.id === addOn.id
                  );
                  return (
                    <TouchableOpacity
                      disabled={isReadOnly}
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
              editable={!isReadOnly}
              value={notes}
              onChangeText={setNotes}
              placeholder="Make the cheese more melted"
              multiline
              className="p-3 border bg-white border-[#F1F1F1] rounded-lg h-20"
            />
          </View>
          <View className="border-t border-gray-200 flex-row justify-between items-center py-2">
            <Text className="text-accent-500 font-medium">Total</Text>
            <Text className="text-2xl font-semibold text-accent-500">
              ${total.toFixed(2)}
            </Text>
          </View>
          <DialogFooter className=" rounded-b-[36px] border-t border-gray-200 ">
            {isReadOnly ? (
              <TouchableOpacity onPress={close} className="flex-1 py-3 ">
                <Text>Close</Text>
              </TouchableOpacity>
            ) : (
              <View className="py-2 flex-row gap-2 justify-between items-center w-full ">
                <TouchableOpacity
                  onPress={close}
                  className="px-8 py-3 flex-1 rounded-lg border border-gray-300 "
                >
                  <Text className="font-bold text-gray-700 text-center">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSave}
                  className="px-8 py-3 flex-1 rounded-lg bg-primary-400"
                >
                  <Text className="font-bold text-white text-center">Add</Text>
                </TouchableOpacity>
              </View>
            )}
          </DialogFooter>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default ItemCustomizationDialog;
