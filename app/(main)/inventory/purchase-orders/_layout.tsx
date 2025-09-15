import { Slot, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Text, TouchableOpacity, View } from "react-native";

export default function PurchaseOrderLayout() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-[#212121]">
      <View className="flex-row items-center p-4 border-b border-gray-700 bg-[#303030]">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center"
        >
          <ArrowLeft size={20} color="#9CA3AF" />
          <Text className="text-white font-medium ml-2">Back to Inventory</Text>
        </TouchableOpacity>
      </View>
      <View className="flex-1 p-6">
        <Slot />
      </View>
    </View>
  );
}
