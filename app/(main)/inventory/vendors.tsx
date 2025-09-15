import { Vendor } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { Plus, Search } from "lucide-react-native";
import React from "react";
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const VendorRow: React.FC<{ item: Vendor }> = ({ item }) => {
  return (
    <View className="flex-row items-center p-4 border-b border-gray-700">
      <Text className="w-1/4 font-semibold text-white">{item.name}</Text>
      <Text className="w-1/4 text-gray-300">{item.contactPerson}</Text>
      <Text className="w-1/4 text-gray-300">{item.email}</Text>
      <Text className="w-1/4 text-gray-300">{item.phone}</Text>
    </View>
  );
};

const VendorScreen = () => {
  const vendors = useInventoryStore((state) => state.vendors);

  const TABLE_HEADERS = ["Vendor Name", "Contact Person", "Email", "Phone"];

  return (
    <View className="flex-1">
      {/* Header and main container are now in _layout.tsx */}
      <View className="flex-row justify-between items-center mb-4">
        <View className="flex-row items-center bg-[#303030] border border-gray-700 rounded-lg p-3 w-[350px]">
          <Search color="#9CA3AF" size={16} />
          <TextInput
            placeholder="Search by vendor name..."
            placeholderTextColor="#9CA3AF"
            className="ml-2 text-base text-white flex-1"
          />
        </View>
        <TouchableOpacity className="py-3 px-5 bg-blue-600 rounded-lg flex-row items-center">
          <Plus color="white" size={18} className="mr-2" />
          <Text className="font-bold text-white">Add Vendor</Text>
        </TouchableOpacity>
      </View>

      <View className="flex-1 bg-[#303030] border border-gray-700 rounded-xl">
        <View className="flex-row p-4 bg-gray-800/50 rounded-t-xl border-b border-gray-700">
          {TABLE_HEADERS.map((header) => (
            <Text
              key={header}
              className="w-1/4 font-bold text-sm text-gray-400"
            >
              {header}
            </Text>
          ))}
        </View>
        <FlatList
          data={vendors}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <VendorRow item={item} />}
        />
      </View>
    </View>
  );
};

export default VendorScreen;
