import { MOCK_MENU_ITEMS } from "@/lib/mockData";
import { MenuItemType } from "@/lib/types";
import { useSearchStore } from "@/stores/searchStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Search, X } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { FlatList } from "react-native-gesture-handler";
import SearchResultItem from "./SearchResultItem";

const SearchBottomSheet = React.forwardRef<BottomSheet>(() => {
  const searchSheetRef = useRef<BottomSheetMethods>(null);
  const snapPoints = useMemo(() => ["70%", "75%"], []);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] =
    useState<MenuItemType[]>(MOCK_MENU_ITEMS);

  const { closeSearch, setSearchSheetRef } = useSearchStore();

  useEffect(() => {
    if (searchText.trim() === "") {
      setSearchResults(MOCK_MENU_ITEMS);
    } else {
      const results = MOCK_MENU_ITEMS.filter((item) =>
        item.name.toLowerCase().includes(searchText.toLowerCase())
      );
      setSearchResults(results);
    }
  }, [searchText]);

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
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => <SearchResultItem item={item} />}
          className="px-4"
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center h-48">
              <Text className="text-lg text-gray-500">
                No items found for "{searchText}"
              </Text>
            </View>
          }
        />
      </View>
    </BottomSheet>
  );
});

export default SearchBottomSheet;
