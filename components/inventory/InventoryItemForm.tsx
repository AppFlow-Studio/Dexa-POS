import { InventoryItem } from "@/lib/types";
import { Upload } from "lucide-react-native";
import React, { useState } from "react";
import {
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface InventoryItemFormProps {
  item?: InventoryItem; // If provided, it's an edit form
  onCancel: () => void;
  onSave: (data: any) => void;
}

const InventoryItemForm: React.FC<InventoryItemFormProps> = ({
  item,
  onCancel,
  onSave,
}) => {
  // Form state would be managed here, e.g., with useState or a form library
  const [itemName, setItemName] = useState(item?.name || "");
  const [availability, setAvailability] = useState(item?.availability ?? true);

  return (
    <ScrollView>
      <View className="flex-row gap-6 h-full w-full">
        {/* Left Column: Form Fields */}
        <View className="flex-1 space-y-4">
          {/* Item Image */}
          <View>
            <Text className="text-2xl font-bold mb-2">Item Image</Text>
            <TouchableOpacity className="border-2 border-dashed border-gray-300 rounded-lg h-48 items-center justify-center">
              <Upload color="#6b7280" size={48} />
              <Text className="text-xl text-gray-500 mt-2">
                Click to upload
              </Text>
              <Text className="text-lg text-gray-400">JPG, PNG (Max 2 MB)</Text>
            </TouchableOpacity>
          </View>
          {/* Other fields: Name, Description, Category, etc. */}
          <View>
            <Text className="text-2xl font-bold mb-2">Item Name</Text>
            <TextInput
              value={itemName}
              onChangeText={setItemName}
              className="p-4 bg-gray-100 rounded-lg text-2xl h-20"
            />
          </View>
          <View>
            <Text className="text-2xl font-bold mb-2">Availability</Text>
            <View className="flex-row items-center justify-between p-4 bg-gray-100 rounded-lg">
              <Text className="text-2xl">
                Enable and show this product in the menu
              </Text>
              <Switch
                value={availability}
                onValueChange={setAvailability}
                trackColor={{ false: "#DCDCDC", true: "#31A961" }}
                thumbColor={"#ffffff"}
                style={{ transform: [{ scaleX: 1.5 }, { scaleY: 1.5 }] }}
              />
            </View>
          </View>
        </View>
        {/* Right Column: Preview */}
        <View className="flex-1">
          <Text className="text-2xl font-bold mb-2">Preview</Text>
          <View className="bg-gray-100 p-6 rounded-lg">
            {/* Reuse your MenuItem for a live preview */}
            {/* <MenuItem item={{...}} onAddToCart={() => {}} /> */}
          </View>
        </View>
      </View>
      {/* Footer Actions */}
      <View className="flex-row gap-3 mt-6 border-t border-gray-200 pt-4 justify-end">
        <TouchableOpacity
          onPress={onCancel}
          className="px-6 py-4 border border-gray-300 rounded-lg"
        >
          <Text className="text-2xl font-bold text-gray-700">Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onSave({})}
          className="px-8 py-4 bg-primary-400 rounded-lg"
        >
          <Text className="text-2xl font-bold text-white">
            {item ? "Save" : "Add"}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default InventoryItemForm;
