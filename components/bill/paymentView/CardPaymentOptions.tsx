import { usePaymentStore } from "@/stores/usePaymentStore";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const CardPaymentOptions = () => {
  const { setView, close } = usePaymentStore();

  const handleUseCardReader = () => {
    setView("card"); // Navigate to the existing card reader view
  };

  const handleManualEntry = () => {
    setView("manual"); // Navigate to the new manual card entry view
  };

  return (
    <View className="rounded-2xl overflow-hidden bg-[#212121] border border-gray-700 w-[550px]">
      {/* Dark Header */}
      <View className="p-4">
        <Text className="text-2xl text-white font-bold text-center">
          Card Payment Options
        </Text>
      </View>

      {/* Dark Content */}
      <View className="p-4 bg-[#303030] rounded-b-2xl flex-col items-center">
        {/* Option: Use Card Reader */}
        <TouchableOpacity
          onPress={handleUseCardReader}
          className="w-full py-4 bg-blue-600 rounded-xl items-center mb-4 flex-row justify-center"
        >
          <Ionicons name="card-outline" size={24} color="white" className="mr-2" />
          <Text className="text-xl font-bold text-white text-center ml-2">
            Use Card Reader
          </Text>
        </TouchableOpacity>

        {/* Option: Manual Card Entry */}
        <TouchableOpacity
          onPress={handleManualEntry}
          className="w-full py-4 bg-purple-600 rounded-xl items-center flex-row justify-center"
        >
          <Ionicons name="pencil-outline" size={24} color="white" className="mr-2" />
          <Text className="text-xl font-bold text-white text-center ml-2">
            Manual Card Entry
          </Text>
        </TouchableOpacity>

        {/* Back Button */}
        <View className="border-t border-gray-700 pt-4 mt-8 w-full">
          <TouchableOpacity
            onPress={() => setView("review")} // Go back to the payment review screen
            className="w-full py-3 bg-[#303030] border border-gray-600 rounded-xl items-center flex-row justify-center"
          >
            <Ionicons name="arrow-back" size={24} color="white" className="mr-2" />
            <Text className="text-lg font-bold text-white text-center ml-2">
              Back to Payment Review
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default CardPaymentOptions;