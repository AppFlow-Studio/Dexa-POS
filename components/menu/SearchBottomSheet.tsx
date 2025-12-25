import { useSearchStore } from "@/stores/searchStore";
import { useMenuStore } from "@/stores/useMenuStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Search, X } from "lucide-react-native";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { FlatList } from "react-native-gesture-handler";
import SearchResultItem from "./SearchResultItem";

const SearchBottomSheet = React.forwardRef<BottomSheet>(() => {
  const searchSheetRef = useRef<BottomSheetMethods>(null);
  const snapPoints = useMemo(() => ["70%", "75%"], []);
  const [searchText, setSearchText] = useState("");

  // Get menu items directly from store - only re-renders when menuItems array changes
  const menuItems = useMenuStore((state) => state.menuItems);
  const { closeSearch, setSearchSheetRef } = useSearchStore();

  // Optimized search with useMemo - only recalculates when searchText or menuItems change
  const searchResults = useMemo(() => {
    const trimmedSearch = searchText.trim().toLowerCase();

    // If no search text, return all available items
    if (!trimmedSearch) {
      return menuItems.filter((item) => item.availability !== false);
    }

    // Fast filtering - search in name, description, and category
    return menuItems.filter((item) => {
      // Skip unavailable items
      if (item.availability === false) return false;

      // Search in name (most common)
      if (item.name.toLowerCase().includes(trimmedSearch)) return true;

      // Search in description
      if (item.description?.toLowerCase().includes(trimmedSearch)) return true;

      // Search in category names
      const categories = Array.isArray(item.category)
        ? item.category
        : item.category
          ? [item.category]
          : [];
      if (categories.some((cat) => cat.toLowerCase().includes(trimmedSearch))) {
        return true;
      }

      return false;
    });
  }, [searchText, menuItems]);

  // Set ref once on mount
  useLayoutEffect(() => {
    setSearchSheetRef(searchSheetRef as React.RefObject<BottomSheetMethods>);
  }, [setSearchSheetRef]);

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
      backdropComponent={renderBackdrop}
      keyboardBehavior="extend"
    >
      {/* Header */}
      <BottomSheetView className="flex-row items-center border-b border-background-400 rounded-2xl px-2">
        <View className="flex-row items-center flex-1  rounded-lg px-2 bg-gray-100">
          <Search color="#6b7280" size={20} />
          <BottomSheetTextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search Item"
            className="flex-1 py-3 ml-2 text-lg text-gray-900"
            placeholderTextColor="#6b7280"
            focusable
          />
        </View>
        <TouchableOpacity
          onPress={closeSearch}
          className="flex-row items-center ml-2 p-2"
        >
          <X color="#4b5563" size={20} />
          <Text className="ml-1 text-lg font-semibold text-gray-600">
            Cancel
          </Text>
        </TouchableOpacity>
      </BottomSheetView>

      {/* Results List */}
      <View className="mt-14">
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SearchResultItem item={item} />}
          className="px-4"
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          initialNumToRender={15}
          windowSize={10}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center h-48">
              <Text className="text-lg text-gray-500">
                {searchText.trim()
                  ? `No items found for "${searchText}"`
                  : "No menu items available"}
              </Text>
            </View>
          }
        />
      </View>
    </BottomSheet>
  );
});

export default SearchBottomSheet;
