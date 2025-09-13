import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModifierOption } from "@/lib/types";
import React, { useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const OptionEditorModal = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<ModifierOption, "id">) => void;
  initialData?: ModifierOption | null;
}) => {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setPrice(initialData.price.toString());
    } else {
      setName("New Option");
      setPrice("0");
    }
  }, [initialData, isOpen]);

  const handleSave = () => {
    onSave({ name, price: parseFloat(price) || 0 });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle>
            {initialData ? "Edit" : "Add"} Modifier Option
          </DialogTitle>
        </DialogHeader>
        <View className="space-y-4 py-4">
          <View>
            <Text className="font-semibold text-gray-700 mb-2">
              Option Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              className="p-3 bg-gray-100 rounded-lg"
            />
          </View>
          <View>
            <Text className="font-semibold text-gray-700 mb-2">
              Price (add $)
            </Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              className="p-3 bg-gray-100 rounded-lg"
            />
          </View>
        </View>
        <DialogFooter>
          <TouchableOpacity
            onPress={onClose}
            className="px-6 py-3 border border-gray-300 rounded-lg"
          >
            <Text>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            className="px-8 py-3 bg-primary-400 rounded-lg"
          >
            <Text className="text-white">Save</Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OptionEditorModal;
