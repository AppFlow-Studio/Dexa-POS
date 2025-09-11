import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MenuItemType, PricingType } from "@/lib/types";
import { useModifierGroupStore } from "@/stores/useModifierGroupStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Image } from "expo-image";
import { Plus, Upload, X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  NativeSyntheticEvent,
  Switch,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  TouchableOpacity,
  View,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

// A simplified preview component to show what the menu item will look like
const MenuItemPreview = ({
  name,
  price,
  color,
}: {
  name: string;
  price: string;
  color: string;
}) => (
  <View
    className="w-full p-4 rounded-lg border border-gray-200"
    style={{ backgroundColor: color || "#FFFFFF" }}
  >
    <View className="flex-row items-center gap-2">
      <View className="w-16 h-16 rounded-lg bg-white p-1">
        <Image
          source={require("@/assets/images/classic_burger.png")}
          className="w-full h-full"
        />
      </View>
      <View className="flex-1">
        <Text className="text-base font-bold text-gray-800">
          {name || "Item Name"}
        </Text>
        <Text className="text-base font-semibold text-gray-700">
          ${price || "0.00"}
        </Text>
      </View>
    </View>
    <TouchableOpacity className="w-full mt-4 py-3 rounded-xl items-center justify-center bg-white/70">
      <View className="flex-row items-center">
        <Plus color="#3D72C2" size={16} strokeWidth={3} />
        <Text className="text-blue-600 font-bold ml-1.5">Add to Cart</Text>
      </View>
    </TouchableOpacity>
  </View>
);

const ColorPicker = ({
  selectedColor,
  onSelect,
}: {
  selectedColor: string;
  onSelect: (color: string) => void;
}) => {
  const colors = ["#FEE2E2", "#D1FAE5", "#DBEAFE", "#FEF3C7", "#F3E8FF"];
  return (
    <View className="flex-row gap-2">
      {colors.map((color) => (
        <TouchableOpacity
          key={color}
          onPress={() => onSelect(color)}
          className={`w-10 h-10 rounded-full border-2 ${selectedColor === color ? "border-primary-400" : "border-transparent"}`}
          style={{ backgroundColor: color }}
        />
      ))}
    </View>
  );
};

const Pill = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <View className="flex-row items-center bg-blue-100 px-3 py-1.5 rounded-full">
    <Text className="text-blue-800 font-semibold">{label}</Text>
    <TouchableOpacity onPress={onRemove} className="ml-2">
      <X size={16} color="#2563EB" />
    </TouchableOpacity>
  </View>
);

interface InventoryItemFormProps {
  item?: MenuItemType;
  onSave: (data: Partial<MenuItemType>) => void;
  onCancel: () => void;
}

type SelectOption = { label: string; value: string };

export const InventoryItemForm: React.FC<InventoryItemFormProps> = ({
  item,
  onSave,
  onCancel,
}) => {
  const { modifierGroups } = useModifierGroupStore();

  // --- FORM STATE ---
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SelectOption | undefined>();
  const [color, setColor] = useState("#FEE2E2");
  const [pricingType, setPricingType] = useState<PricingType>("fixed");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState<SelectOption | undefined>();
  const [availability, setAvailability] = useState(true);
  const [attachedModifierGroupIds, setAttachedModifierGroupIds] = useState<
    string[]
  >([]);
  const [selectedMeals, setSelectedMeals] = useState<string[]>([]);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [allergenInput, setAllergenInput] = useState("");

  // --- OPTIONS ---
  const CATEGORY_OPTIONS: SelectOption[] = [
    "Appetizers",
    "Main Course",
    "Sides",
    "Drinks",
    "Dessert",
    "Pastries",
    "Breads",
  ].map((val) => ({ label: val, value: val }));
  const UNIT_OPTIONS: SelectOption[] = ["PCs", "KGs", "Liters"].map((val) => ({
    label: val,
    value: val,
  }));
  const MEAL_OPTIONS: SelectOption[] = [
    "Lunch",
    "Dinner",
    "Brunch",
    "Specials",
  ].map((val) => ({ label: val, value: val }));
  const MODIFIER_GROUP_OPTIONS = modifierGroups.map((g) => ({
    label: g.name,
    value: g.id,
  }));

  useEffect(() => {
    if (item) {
      setName(item.name);
      setDescription(item.description || "");
      setCategory({ label: item.category, value: item.category });
      setColor(item.color || "#FEE2E2");
      setPricingType(item.pricingType);
      setPrice(item.price.toString());
      setStock(item.stock.toString());
      setUnit({ label: item.unit, value: item.unit });
      setAvailability(item.availability);
      setAttachedModifierGroupIds(item.modifierGroupIds || []);
      setSelectedMeals(item.meal || []);
      setAllergens(item.allergens || []);
    }
  }, [item]);

  const handleToggleMultiSelect = (
    value: string,
    currentSelection: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const newSelection = currentSelection.includes(value)
      ? currentSelection.filter((v) => v !== value)
      : [...currentSelection, value];
    setter(newSelection);
  };

  const handleAllergenKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>
  ) => {
    if (e.nativeEvent.key === "," || e.nativeEvent.key === "Enter") {
      e.preventDefault(); // Prevent adding comma/newline to input
      const newAllergen = allergenInput.trim();
      if (newAllergen && !allergens.includes(newAllergen)) {
        setAllergens((prev) => [...prev, newAllergen]);
      }
      setAllergenInput(""); // Clear the input
    }
  };

  const removeAllergen = (allergenToRemove: string) => {
    setAllergens((prev) => prev.filter((a) => a !== allergenToRemove));
  };

  const handleSave = () => {
    // --- VALIDATION ---
    if (!name.trim()) {
      toast.error("Item Name cannot be empty.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }
    if (!category?.value) {
      toast.error("Please select a category.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }
    if (!unit) {
      toast.error("Please select a unit.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }
    if (!selectedMeals.length) {
      toast.error("Please select a meal.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }
    const parsedPrice = parseFloat(price);
    if (pricingType === "fixed" && (isNaN(parsedPrice) || parsedPrice < 0)) {
      toast.error("Please enter a valid price.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }
    const parsedStock = parseInt(stock, 10);
    if (isNaN(parsedStock) || parsedStock < 0) {
      toast.error("Please enter a valid stock amount.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    const saveData: Partial<MenuItemType> = {
      name,
      description,
      category: category.value as any,
      color,
      pricingType,
      price: parsedPrice,
      stock: parsedStock,
      unit: unit?.value as any,
      availability,
      modifierGroupIds: attachedModifierGroupIds,
      meal: selectedMeals as any,
      allergens,
      status: parsedStock > 0 ? "Active" : "Out of Stock",
    };

    onSave(saveData);
  };

  return (
    <ScrollView className="flex-1 bg-white p-6">
      <View className="flex-row gap-6">
        {/* --- Left Column --- */}
        <View className="flex-[2] space-y-4">
          <View>
            <Text className="font-bold mb-2 text-gray-700">Item Image</Text>
            <TouchableOpacity className="border-2 border-dashed border-gray-300 rounded-lg h-40 items-center justify-center">
              <Upload color="#6b7280" size={32} />
              <Text className="text-gray-500 mt-2">Click to upload</Text>
            </TouchableOpacity>
          </View>
          <View>
            <Text className="font-bold mb-2 text-gray-700">Item Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              className="p-3 bg-gray-50 border border-gray-200 rounded-lg"
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
            />
          </View>
          <View>
            <Text className="font-bold mb-2 text-gray-700">
              Category Assigned
            </Text>
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
          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text className="font-bold mb-2 text-gray-700">Stock</Text>
              <TextInput
                value={stock}
                onChangeText={setStock}
                keyboardType="numeric"
                className="p-3 bg-gray-50 border border-gray-200 rounded-lg"
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
        </View>

        {/* --- Right Column --- */}
        <View className="flex-1 space-y-4">
          <View>
            <Text className="font-bold mb-2 text-gray-700">Preview</Text>
            <MenuItemPreview name={name} price={price} color={color} />
          </View>
          <View>
            <Text className="font-bold mb-2 text-gray-700">Color of Box</Text>
            <ColorPicker selectedColor={color} onSelect={setColor} />
          </View>
          <View>
            <Text className="font-bold mb-2 text-gray-700">Pricing Type</Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setPricingType("fixed")}
                className={`flex-1 items-center p-3 rounded-lg border-2 ${pricingType === "fixed" ? "border-primary-400" : "border-gray-200"}`}
              >
                <Text className="font-semibold">Fixed Price</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPricingType("at_sale")}
                className={`flex-1 items-center p-3 rounded-lg border-2 ${pricingType === "at_sale" ? "border-primary-400" : "border-gray-200"}`}
              >
                <Text className="font-semibold">Set at Sale</Text>
              </TouchableOpacity>
            </View>
            {pricingType === "fixed" && (
              <TextInput
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg"
                placeholder="$0.00"
              />
            )}
          </View>
          <View>
            <Text className="font-bold mb-2 text-gray-700">Availability</Text>
            <View className="flex-row items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <Text className="text-gray-600">Enable in menu</Text>
              <Switch
                value={availability}
                onValueChange={setAvailability}
                trackColor={{ false: "#DCDCDC", true: "#34D399" }}
                thumbColor={"#ffffff"}
              />
            </View>
          </View>
        </View>
      </View>

      {/* --- Full-Width Sections --- */}
      <View className="mt-6 space-y-6">
        <View>
          <Text className="font-bold mb-2 text-gray-700">
            Modifier Groups Attached
          </Text>
          <Popover>
            <PopoverTrigger asChild>
              <TouchableOpacity className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <Text>Select Modifiers...</Text>
              </TouchableOpacity>
            </PopoverTrigger>
            <PopoverContent className="p-2 w-80">
              <ScrollView style={{ maxHeight: 250 }}>
                {MODIFIER_GROUP_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() =>
                      handleToggleMultiSelect(
                        opt.value,
                        attachedModifierGroupIds,
                        setAttachedModifierGroupIds
                      )
                    }
                    className="flex-row items-center p-2 rounded-md hover:bg-gray-100"
                  >
                    <View
                      className={`w-5 h-5 border-2 rounded-md mr-2 ${attachedModifierGroupIds.includes(opt.value) ? "bg-primary-400 border-primary-400" : "border-gray-300"}`}
                    />
                    <Text>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </PopoverContent>
          </Popover>
          <View className="flex-row flex-wrap gap-2 mt-2">
            {attachedModifierGroupIds.map((id) => {
              const group = modifierGroups.find((g) => g.id === id);
              return group ? (
                <Pill
                  key={id}
                  label={group.name}
                  onRemove={() =>
                    handleToggleMultiSelect(
                      id,
                      attachedModifierGroupIds,
                      setAttachedModifierGroupIds
                    )
                  }
                />
              ) : null;
            })}
          </View>
        </View>
        <View>
          <Text className="font-bold mb-2 text-gray-700">Meals</Text>
          <Popover>
            <PopoverTrigger asChild>
              <TouchableOpacity className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <Text>Select Meals...</Text>
              </TouchableOpacity>
            </PopoverTrigger>
            <PopoverContent className="p-2 w-64">
              <ScrollView style={{ maxHeight: 200 }}>
                {MEAL_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() =>
                      handleToggleMultiSelect(
                        opt.value,
                        selectedMeals,
                        setSelectedMeals
                      )
                    }
                    className="flex-row items-center p-2 rounded-md hover:bg-gray-100"
                  >
                    <View
                      className={`w-5 h-5 border-2 rounded-md mr-2 ${selectedMeals.includes(opt.value) ? "bg-primary-400 border-primary-400" : "border-gray-300"}`}
                    />
                    <Text>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </PopoverContent>
          </Popover>
          <View className="flex-row flex-wrap gap-2 mt-2">
            {selectedMeals.map((meal) => (
              <Pill
                key={meal}
                label={meal}
                onRemove={() =>
                  handleToggleMultiSelect(meal, selectedMeals, setSelectedMeals)
                }
              />
            ))}
          </View>
        </View>
        <View>
          <Text className="font-bold mb-2 text-gray-700">Allergens</Text>
          <View className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <View className="flex-row flex-wrap gap-2">
              {allergens.map((allergen) => (
                <Pill
                  key={allergen}
                  label={allergen}
                  onRemove={() => removeAllergen(allergen)}
                />
              ))}
            </View>
            <TextInput
              value={allergenInput}
              onChangeText={setAllergenInput}
              placeholder="Type and press enter..."
              onKeyPress={handleAllergenKeyPress}
              className="mt-2 text-base"
            />
          </View>
        </View>
      </View>

      {/* Footer Actions */}
      <View className="flex-row gap-4 mt-8 mb-10 border-t border-gray-200 pt-4">
        <TouchableOpacity
          onPress={onCancel}
          className="px-8 py-3 bg-white border border-gray-300 rounded-lg"
        >
          <Text className="font-bold text-gray-700">Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          className="px-8 py-3 bg-primary-400 rounded-lg"
        >
          <Text className="font-bold text-white">
            {item ? "Save Changes" : "Add"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};
