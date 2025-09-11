import { MOCK_MENU_ITEMS } from "@/lib/mockData";
import { CartItem } from "@/lib/types";
import { useModifierGroupStore } from "@/stores/useModifierGroupStore";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { ArrowLeft, Check, Minus, Plus, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface ModifierSelection {
  [categoryId: string]: {
    [optionId: string]: boolean;
  };
}

const ModifierScreen = () => {
  const { isOpen, mode, menuItem, cartItem, close } = useModifierSidebarStore();
  const { addItemToActiveOrder, updateItemInActiveOrder } = useOrderStore();
  const { modifierGroups } = useModifierGroupStore();

  const [quantity, setQuantity] = useState(1);
  const [modifierSelections, setModifierSelections] =
    useState<ModifierSelection>({});
  const [notes, setNotes] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const isReadOnly = mode === "view";
  const currentItem =
    mode === "edit" || (mode === "fullscreen" && cartItem)
      ? cartItem
      : menuItem;

  const menuItemForModifiers =
    (mode === "edit" || (mode === "fullscreen" && cartItem)) && cartItem
      ? MOCK_MENU_ITEMS.find((item) => item.id === cartItem.menuItemId)
      : menuItem;

  const displayedModifierGroups = useMemo(() => {
    if (!menuItemForModifiers?.modifierGroupIds) return [];
    return modifierGroups.filter((group) =>
      menuItemForModifiers.modifierGroupIds!.includes(group.id)
    );
  }, [menuItemForModifiers, modifierGroups]);

  useEffect(() => {
    if (isOpen && currentItem) {
      setQuantity(
        mode === "edit" || (mode === "fullscreen" && cartItem)
          ? cartItem!.quantity
          : 1
      );
      setNotes(
        mode === "edit" || (mode === "fullscreen" && cartItem)
          ? cartItem!.customizations.notes || ""
          : ""
      );

      const initialSelections: ModifierSelection = {};
      if (displayedModifierGroups) {
        displayedModifierGroups.forEach((group) => {
          initialSelections[group.id] = {};
          const existingModifier = cartItem?.customizations.modifiers?.find(
            (mod) => mod.categoryId === group.id
          );

          if (existingModifier) {
            existingModifier.options.forEach((opt) => {
              initialSelections[group.id][opt.id] = true;
            });
          } else if (
            group.type === "required" &&
            group.selectionType === "single"
          ) {
            const firstAvailable = group.options.find(
              (opt) => opt.isAvailable !== false
            );
            if (firstAvailable) {
              initialSelections[group.id][firstAvailable.id] = true;
            }
          }
        });

        if (displayedModifierGroups.length > 0) {
          setActiveCategory(displayedModifierGroups[0].id);
        }
      }
      setModifierSelections(initialSelections);

      if (mode !== "edit" && !cartItem) {
        // This draft logic can be refined, but let's keep it for now
      }
    }
  }, [isOpen, currentItem, mode, cartItem, displayedModifierGroups]);

  const total = useMemo(() => {
    if (!currentItem) return 0;
    let baseTotal = currentItem.price;

    Object.entries(modifierSelections).forEach(([groupId, selections]) => {
      const group = displayedModifierGroups.find((g) => g.id === groupId);
      if (group) {
        Object.entries(selections).forEach(([optionId, isSelected]) => {
          if (isSelected) {
            const option = group.options.find((opt) => opt.id === optionId);
            if (option) {
              baseTotal += option.price;
            }
          }
        });
      }
    });

    return baseTotal * quantity;
  }, [quantity, modifierSelections, currentItem, displayedModifierGroups]);

  const handleModifierToggle = useCallback(
    (groupId: string, optionId: string) => {
      if (isReadOnly) return;

      setModifierSelections((prev) => {
        const group = displayedModifierGroups.find((g) => g.id === groupId);
        if (!group) return prev;

        const newSelections = JSON.parse(JSON.stringify(prev)); // Deep copy
        if (!newSelections[groupId]) newSelections[groupId] = {};

        if (group.selectionType === "single") {
          Object.keys(newSelections[groupId]).forEach((key) => {
            newSelections[groupId][key] = false;
          });
          newSelections[groupId][optionId] = true; // Always select for single choice
        } else {
          // multiple
          const currentSelectedCount = Object.values(
            newSelections[groupId]
          ).filter(Boolean).length;
          const isCurrentlySelected = newSelections[groupId][optionId];

          if (
            !isCurrentlySelected &&
            group.maxSelections &&
            currentSelectedCount >= group.maxSelections
          ) {
            toast.error(
              `You can select a maximum of ${group.maxSelections} options.`,
              { position: ToastPosition.BOTTOM }
            );
            return prev; // Do not update state
          }
          newSelections[groupId][optionId] = !isCurrentlySelected;
        }
        return newSelections;
      });
    },
    [isReadOnly, displayedModifierGroups]
  );

  const handleSave = useCallback(() => {
    if (!currentItem) return;

    // Validate required selections against the new group structure
    for (const group of displayedModifierGroups) {
      const selections = modifierSelections[group.id] || {};
      const selectedCount = Object.values(selections).filter(Boolean).length;

      if (selectedCount < group.minSelections) {
        toast.error(
          `Please select at least ${group.minSelections} option(s) for ${group.name}.`,
          {
            duration: 4000,
            position: ToastPosition.BOTTOM,
          }
        );
        return; // Stop the save process
      }
    }

    // Convert modifier selections into the format for the cart item
    const selectedModifiers = displayedModifierGroups
      .map((group) => {
        const selections = modifierSelections[group.id] || {};
        const selectedOptions = group.options
          .filter((option) => selections[option.id])
          .map((option) => ({
            id: option.id,
            name: option.name,
            price: option.price,
          }));

        return {
          categoryId: group.id,
          categoryName: group.name,
          options: selectedOptions,
        };
      })
      .filter((group) => group.options.length > 0); // Only include groups with selections

    if ((mode === "edit" || (mode === "fullscreen" && cartItem)) && cartItem) {
      // --- UPDATE EXISTING ITEM ---
      const updatedItem: CartItem = {
        ...cartItem,
        quantity,
        price: total / quantity,
        customizations: {
          ...cartItem.customizations,
          modifiers: selectedModifiers,
          notes,
        },
      };
      updateItemInActiveOrder(updatedItem);
      toast.success(`Updated ${currentItem.name}`, {
        position: ToastPosition.BOTTOM,
      });
    } else {
      // --- ADD NEW ITEM ---
      const newItem: CartItem = {
        id: `${currentItem.id}_${Date.now()}`,
        menuItemId: currentItem.id,
        name: currentItem.name,
        quantity,
        originalPrice: currentItem.price,
        price: total / quantity,
        image: currentItem.image,
        customizations: {
          modifiers: selectedModifiers,
          notes,
        },
        availableDiscount: currentItem.availableDiscount,
        appliedDiscount: null,
        paidQuantity: 0,
        item_status: "Preparing",
      };
      addItemToActiveOrder(newItem);
      toast.success(`Added ${currentItem.name}`, {
        position: ToastPosition.BOTTOM,
      });
    }

    close();
  }, [
    currentItem,
    modifierSelections,
    quantity,
    notes,
    total,
    mode,
    cartItem,
    close,
    addItemToActiveOrder,
    updateItemInActiveOrder,
    displayedModifierGroups,
  ]);

  const handleCancel = useCallback(() => {
    // Remove draft item if we're in add mode (not edit mode)
    if (
      mode !== "edit" &&
      !(mode === "fullscreen" && cartItem) &&
      !cartItem &&
      currentItem
    ) {
      const { activeOrderId, orders, removeItemFromActiveOrder } =
        useOrderStore.getState();
      const activeOrder = orders.find((o) => o.id === activeOrderId);
      const draftItem = activeOrder?.items.find((item) =>
        item.id.startsWith(`draft_${currentItem.id}_`)
      );

      if (draftItem) {
        removeItemFromActiveOrder(draftItem.id);
      }
    }
    close();
  }, [close, mode, cartItem, currentItem]);

  if (!isOpen || !currentItem) return null;

  const currentCategory = displayedModifierGroups.find(
    (cat) => cat.id === activeCategory
  );

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between p-6 border-b border-gray-200 bg-white">
        <TouchableOpacity
          onPress={handleCancel}
          className="flex-row items-center"
        >
          <ArrowLeft color="#374151" size={24} />
          <Text className="text-lg font-medium text-gray-700 ml-2">
            {mode === "edit" || (mode === "fullscreen" && cartItem)
              ? "Back to Bill"
              : "Back to Menu"}
          </Text>
        </TouchableOpacity>

        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={handleCancel}
            className="p-2 rounded-full bg-gray-100"
          >
            <X color="#6b7280" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            className="p-2 rounded-full bg-green-500"
          >
            <Check color="#FFFFFF" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Item Header */}
        <View className="p-6 border-b border-gray-200">
          <View className="flex-row items-center gap-4">
            <Image
              source={require("@/assets/images/classic_burger.png")}
              className="w-20 h-20 rounded-lg"
            />
            <View className="flex-1">
              <Text className="text-2xl font-bold text-gray-800">
                {currentItem.name}
              </Text>
              <Text className="text-sm text-gray-600 mt-1">
                {menuItemForModifiers?.description}
              </Text>
              <Text className="text-xl font-semibold text-blue-600 mt-2">
                Base ${currentItem.price.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Modifier Groups */}
        {displayedModifierGroups.length > 0 && (
          <View className="p-6">
            <Text className="text-xl font-bold text-gray-800 mb-4">
              Modifier Options
            </Text>

            {/* Modifier Category Cards */}
            <View className="flex-row flex-wrap gap-3 mb-6">
              {displayedModifierGroups.map((group) => {
                const hasSelection = Object.values(
                  modifierSelections[group.id] || {}
                ).some(Boolean);
                const isActive = activeCategory === group.id;

                return (
                  <TouchableOpacity
                    key={group.id}
                    onPress={() => setActiveCategory(group.id)}
                    className={`p-4 rounded-xl border-2 min-w-[140px] ${
                      isActive
                        ? "bg-gray-800 border-gray-800"
                        : hasSelection
                          ? "bg-green-50 border-green-200"
                          : "bg-white border-gray-200"
                    }`}
                  >
                    <View className="flex-row items-center justify-between mb-2">
                      <Text
                        className={`font-semibold text-sm ${isActive ? "text-white" : "text-gray-800"}`}
                      >
                        {group.name}
                      </Text>
                      {hasSelection && (
                        <Check
                          color={isActive ? "#FFFFFF" : "#10B981"}
                          size={16}
                        />
                      )}
                    </View>
                    <Text
                      className={`text-xs ${group.minSelections > 0 ? "text-red-500" : "text-gray-500"}`}
                    >
                      {group.minSelections > 0 ? "Required" : "Optional"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Active Category Options */}
            {currentCategory && (
              <View className="mb-6">
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-lg font-semibold text-gray-800">
                    {currentCategory.name}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm text-red-500">
                      {currentCategory.minSelections > 0
                        ? "Required"
                        : "Optional"}
                    </Text>
                    <Text className="text-sm text-gray-500">
                      {currentCategory.maxSelections === 1
                        ? "Single select"
                        : "Multiple select"}
                    </Text>
                  </View>
                </View>

                <View className="flex-row flex-wrap gap-3">
                  {currentCategory.options.map((option) => {
                    const isSelected =
                      modifierSelections[currentCategory.id]?.[option.id] ||
                      false;
                    const isUnavailable = option.isAvailable === false;

                    return (
                      <TouchableOpacity
                        key={option.id}
                        disabled={isReadOnly || isUnavailable}
                        onPress={() =>
                          handleModifierToggle(currentCategory.id, option.id)
                        }
                        className={`p-4 rounded-xl border-2 min-w-[120px] ${
                          isSelected
                            ? "bg-gray-800 border-gray-800"
                            : isUnavailable
                              ? "bg-gray-100 border-gray-200"
                              : "bg-white border-gray-200"
                        }`}
                      >
                        <Text
                          className={`font-medium text-center ${
                            isSelected
                              ? "text-white"
                              : isUnavailable
                                ? "text-gray-400"
                                : "text-gray-800"
                          }`}
                        >
                          {option.name}
                          {isUnavailable && " (86'd)"}
                        </Text>
                        {option.price > 0 && (
                          <Text
                            className={`text-sm text-center mt-1 ${isSelected ? "text-gray-300" : "text-blue-600"}`}
                          >
                            +${option.price.toFixed(2)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Quantity */}
        <View className="p-6 border-b border-gray-200">
          <Text className="text-lg font-semibold text-gray-800 mb-4">
            Quantity
          </Text>
          <View className="flex-row items-center justify-center">
            <TouchableOpacity
              disabled={isReadOnly}
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              className="p-4 border border-gray-300 rounded-full bg-white"
            >
              <Minus color="#4b5563" size={24} />
            </TouchableOpacity>
            <Text className="text-3xl font-bold text-gray-800 mx-12 w-12 text-center">
              {quantity}
            </Text>
            <TouchableOpacity
              disabled={isReadOnly}
              onPress={() => setQuantity((q) => q + 1)}
              className="p-4 bg-blue-600 rounded-full"
            >
              <Plus color="#FFFFFF" size={24} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Notes */}
        <View className="p-6 border-b border-gray-200">
          <Text className="text-lg font-semibold text-gray-800 mb-4">
            Notes (optional)
          </Text>
          <TextInput
            editable={!isReadOnly}
            value={notes}
            onChangeText={setNotes}
            placeholder="No onions, cut in half..."
            multiline
            maxLength={80}
            className="p-4 border border-gray-200 rounded-lg bg-white min-h-[100px] text-base"
          />
          <Text className="text-sm text-gray-500 mt-2 text-right">
            {notes.length}/80
          </Text>
        </View>

        {/* Allergens */}
        {menuItemForModifiers?.allergens &&
          menuItemForModifiers.allergens.length > 0 && (
            <View className="p-6 border-b border-gray-200">
              <Text className="text-lg font-semibold text-gray-800 mb-4">
                Allergens
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {menuItemForModifiers.allergens.map((allergen) => (
                  <View
                    key={allergen}
                    className="px-4 py-2 bg-red-100 rounded-full"
                  >
                    <Text className="text-sm text-red-700">{allergen}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

        {/* Total */}
        <View className="p-6">
          <View className="flex-row justify-between items-center bg-gray-50 p-4 rounded-lg">
            <Text className="text-xl font-semibold text-gray-800">Total</Text>
            <Text className="text-3xl font-bold text-gray-800">
              ${total.toFixed(2)}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export default ModifierScreen;
