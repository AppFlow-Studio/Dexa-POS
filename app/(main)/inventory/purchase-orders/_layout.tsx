import { Slot, useRouter } from "expo-router";
import { View } from "react-native";

export default function PurchaseOrderLayout() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-[#212121]">
      {/* <View className="flex-row items-center p-6 border-b border-gray-700 bg-[#303030]">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center"
        >
          <ArrowLeft size={24} color="#9CA3AF" />
          <Text className="text-2xl text-white font-medium ml-3">
            Back to Inventory
          </Text>
        </TouchableOpacity>
      </View>
     */}
      <Slot />
    </View>
  );
}
