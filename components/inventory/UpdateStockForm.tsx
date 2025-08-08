import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const UpdateStockForm = ({ onCancel, onSave }: any) => {
  const [tab, setTab] = useState<"in" | "out">("in");
  const [quantity, setQuantity] = useState(1);

  return (
    <View className="space-y-6">
      <View className="bg-gray-100 p-1 rounded-xl flex-row">
        <TouchableOpacity
          onPress={() => setTab("in")}
          className={`flex-1 py-2 items-center rounded-lg ${tab === "in" ? "bg-white shadow-sm" : ""}`}
        >
          <Text
            className={`font-bold ${tab === "in" ? "text-primary-400" : "text-gray-600"}`}
          >
            Stock In
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab("out")}
          className={`flex-1 py-2 items-center rounded-lg ${tab === "out" ? "bg-white shadow-sm" : ""}`}
        >
          <Text
            className={`font-bold ${tab === "out" ? "text-primary-400" : "text-gray-600"}`}
          >
            Stock Out
          </Text>
        </TouchableOpacity>
      </View>
      {/* ... Other form fields ... */}
      <View className="flex-row space-x-2 mt-6 pt-4 border-t border-gray-200 justify-end">
        <TouchableOpacity
          onPress={onCancel}
          className="px-6 py-3 border border-gray-300 rounded-lg"
        >
          <Text className="font-bold text-gray-700">Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSave}
          className={`px-8 py-3 rounded-lg ${tab === "in" ? "bg-primary-400" : "bg-red-500"}`}
        >
          <Text className="font-bold text-white">
            {tab === "in" ? "Stock In" : "Stock Out"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default UpdateStockForm;
