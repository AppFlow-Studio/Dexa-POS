import { useSearchStore } from "@/stores/searchStore";
import { useItemStore } from "@/stores/useItemStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Search, X } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import SearchResultItem from "./SearchResultItem";

const SearchBottomSheet = React.forwardRef<BottomSheet>(() => {
  const searchSheetRef = useRef<BottomSheetMethods>(null);
  const snapPoints = useMemo(() => ["70%", "75%"], []);
  const [searchText, setSearchText] = useState("");

  const { closeSearch, setSearchSheetRef } = useSearchStore();
  const { items } = useItemStore();

  const searchResults = useMemo(() => {
    if (searchText.trim() === "") {
      // Show all available items when the search is empty
      return items.filter(
        (item) => item.availability && item.status === "Active"
      );
    }
    // Filter based on search text
    return items.filter(
      (item) =>
        item.availability &&
        item.status === "Active" &&
        item.name.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [searchText, items]);

  useEffect(() => {
    //@ts-ignore
    setSearchSheetRef(searchSheetRef);
  }, [searchSheetRef]);

  const renderBackdrop = useMemo(
    () => (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
      />
    ),
    []
  );

  return (
    <BottomSheet
      ref={searchSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose={true}
      onClose={closeSearch}
      handleComponent={null}
      backdropComponent={renderBackdrop}
      keyboardBehavior="extend"
    >
      <BottomSheetView className=" bg-white rounded-t-3xl overflow-hidden">
        {/* Header */}
        <View className="flex-row items-center border-b border-background-400 bg-background-300 rounded-2xl px-4">
          <View className="flex-row items-center">
            <Search color="#6b7280" size={18} />
            <BottomSheetTextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search Item"
              className="flex-1 py-3 ml-3 text-lg text-gray-900"
              placeholderTextColor="#6b7280"
              autoFocus={true}
              focusable
            />
          </View>
          <TouchableOpacity
            onPress={closeSearch}
            className="flex-row items-center ml-4 p-2"
          >
            <X color="#4b5563" size={20} />
            <Text className="ml-1.5 text-base font-semibold text-gray-600">
              Cancel
            </Text>
          </TouchableOpacity>
        </View>

        {/* Results List */}
        <BottomSheetFlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SearchResultItem item={item} />}
          className="px-6"
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center h-48">
              <Text className="text-gray-500 text-lg">
                No items found for "{searchText}"
              </Text>
            </View>
          }
        />
      </BottomSheetView>
    </BottomSheet>
  );
});

export default SearchBottomSheet;
