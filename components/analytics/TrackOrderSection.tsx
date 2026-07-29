import { MOCK_TRACKED_ORDERS } from "@/lib/mockData";
import { colors } from "@/lib/theme";
import { ChevronLeft, ChevronRight, Search } from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView, // <--- Imported
  Platform, // <--- Imported
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import TrackOrderCard from "./TrackOrderCard";

const TrackOrderSection = () => {
  const [searchText, setSearchText] = useState("");
  const flatListRef = useRef<FlatList>(null);
  const scrollIndexRef = useRef(0);

  const filteredOrders = useMemo(() => {
    if (!searchText) return MOCK_TRACKED_ORDERS;
    return MOCK_TRACKED_ORDERS.filter(
      (order) =>
        order.customerName.toLowerCase().includes(searchText.toLowerCase()) ||
        order.id.includes(searchText)
    );
  }, [searchText]);

  const scrollForward = () => {
    if (scrollIndexRef.current < filteredOrders.length - 1) {
      scrollIndexRef.current += 1;
      flatListRef.current?.scrollToIndex({
        index: scrollIndexRef.current,
        animated: true,
      });
    }
  };

  const scrollBackward = () => {
    if (scrollIndexRef.current > 0) {
      scrollIndexRef.current -= 1;
      flatListRef.current?.scrollToIndex({
        index: scrollIndexRef.current,
        animated: true,
      });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="mt-6"
    >
      <View className="flex-row justify-between items-center">
        <Text className="text-3xl font-bold text-white">Track Order</Text>
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center bg-panel border border-gray-600 rounded-lg px-4 w-72">
            <Search color={colors.label} size={24} />
            <TextInput
              placeholder="Search Order"
              value={searchText}
              onChangeText={setSearchText}
              className="ml-3 text-2xl flex-1 h-20 placeholder:text-gray-400"
            />
          </View>
          <TouchableOpacity
            onPress={scrollBackward}
            className="p-3 border border-gray-600 rounded-full"
          >
            <ChevronLeft color={colors.label} size={24} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={scrollForward}
            className="p-3 bg-primary-400 rounded-full"
          >
            <ChevronRight color="white" size={24} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-4"
        renderItem={({ item }) => <TrackOrderCard order={item} />}
        ListEmptyComponent={
          <View className="h-40 items-center justify-center">
            <Text className="text-2xl text-white">
              No matching orders found.
            </Text>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
};

export default TrackOrderSection;
