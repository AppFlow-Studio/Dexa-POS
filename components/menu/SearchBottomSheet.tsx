import { bottomSheetTheme, colors } from "@/lib/theme";
import { MenuItemType, Schedule } from "@/lib/types";
import { useSearchStore } from "@/stores/searchStore";
import { useMenuStore } from "@/stores/useMenuStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Search, X } from "lucide-react-native";
import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import SearchResultItem from "./SearchResultItem";

// Helper to check schedule availability
const isScheduleActive = (schedules: Schedule[] | undefined): boolean => {
  if (!schedules || schedules.length === 0) return true;

  const now = new Date();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const currentDay = days[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return schedules.some((schedule) => {
    if (!schedule.isActive) return false;
    if (!schedule.days.includes(currentDay)) return false;

    const [startH, startM] = schedule.startTime.split(":").map(Number);
    const [endH, endM] = schedule.endTime.split(":").map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    if (endTotal < startTotal) {
      // Overnight schedule (e.g. 10PM to 2AM)
      return currentMinutes >= startTotal || currentMinutes <= endTotal;
    }
    return currentMinutes >= startTotal && currentMinutes <= endTotal;
  });
};

interface SearchSection {
  title: string;
  data: (MenuItemType & {
    menuName: string;
    displayPrice: number;
    isDisabled: boolean;
    disabledReason?: string;
    uniqueKey: string;
  })[];
}

const SearchBottomSheet = React.forwardRef<BottomSheet>(() => {
  const searchSheetRef = useRef<BottomSheetMethods>(null);
  const snapPoints = useMemo(() => ["85%"], []);
  const [searchText, setSearchText] = useState("");

  const { menus } = useMenuStore((state) => state);
  const { closeSearch, setSearchSheetRef } = useSearchStore();

  // Menu-Aware Search Logic
  const searchResults = useMemo<SearchSection[]>(() => {
    const trimmedSearch = searchText.trim().toLowerCase();

    const availableSections: SearchSection[] = [];
    const unavailableSections: SearchSection[] = [];

    menus.forEach((menu) => {
      // 1. Check Menu Schedule
      const isMenuAvailable = isScheduleActive(menu.schedules);
      const menuItems: SearchSection["data"] = [];

      menu.categories.forEach((category) => {
        // 2. Check Category Schedule (if categories have schedules?)
        // Assuming undefined schedules means available
        const isCategoryAvailable = isScheduleActive(category.schedules);

        category.items?.forEach((item) => {
          // 3. Match Search Text (show all items when search is empty)
          // 3. Match Search Text (show all items when search is empty)
          if (trimmedSearch) {
            const matchName = item.name.toLowerCase().includes(trimmedSearch);
            const matchDesc = item.description
              ?.toLowerCase()
              .includes(trimmedSearch);
            if (!matchName && !matchDesc) return;
          }

          // 4. Calculate Price (Menu > Category > Item)
          let price = item.price;
          if (
            item.menuPriceOverrides &&
            item.menuPriceOverrides[menu.id] !== undefined
          ) {
            price = item.menuPriceOverrides[menu.id];
          } else if (
            item.categoryPriceOverrides &&
            item.categoryPriceOverrides[category.id] !== undefined
          ) {
            price = item.categoryPriceOverrides[category.id];
          }

          // 5. Determine Availability
          let isDisabled = false;
          let disabledReason = undefined;

          if (item.availability === false) {
            isDisabled = true;
            disabledReason = "Out of Stock";
          } else if (!isMenuAvailable) {
            isDisabled = true;
            disabledReason = "Menu Unavailable";
          } else if (!isCategoryAvailable) {
            isDisabled = true;
            disabledReason = "Category Unavailable";
          }

          menuItems.push({
            ...item,
            uniqueKey: `${menu.id}-${category.id}-${item.id}`,
            menuName: menu.name,
            displayPrice: price,
            isDisabled,
            disabledReason,
          });
        });
      });

      if (menuItems.length > 0) {
        const section = {
          title: menu.name,
          data: menuItems,
        };

        if (isMenuAvailable) {
          availableSections.push(section);
        } else {
          unavailableSections.push(section);
        }
      }
    });

    return [...availableSections, ...unavailableSections];
  }, [searchText, menus]);

  useLayoutEffect(() => {
    setSearchSheetRef(searchSheetRef as React.RefObject<BottomSheetMethods>);
  }, [setSearchSheetRef]);

  const renderBackdrop = useMemo(
    () => (props: any) =>
      (
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
      {...bottomSheetTheme}
    >
      <BottomSheetScrollView
        className="flex-1 bg-panel"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Header - Fixed inside ScrollView or part of it? 
            If inside, it scrolls. Usually nicer if fixed. 
            But to keep it simple and within one scrollView as requested:
        */}
        <View className="bg-panel border-b border-gray-700 pb-4 px-4 pt-2">
          <View className="flex-row items-center">
            <View className="flex-row items-center flex-1 rounded-xl px-3 bg-card h-12">
              <Search color={colors.label} size={20} />
              <BottomSheetTextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search items..."
                className="flex-1 py-2 ml-3 text-lg text-white"
                placeholderTextColor={colors.label}
                style={{ color: "white" }}
              />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={() => setSearchText("")}>
                  <X color={colors.label} size={18} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity onPress={closeSearch} className="ml-4 p-2">
              <Text className="text-lg font-medium text-blue-400">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Manual List Rendering */}
        <View className="px-4 mt-2">
          {searchResults.length === 0 ? (
            <View className="flex-1 items-center justify-center h-48 mt-10">
              <Search size={48} color={colors.muted} />
              <Text className="text-gray-500 mt-4 text-center">
                {searchText
                  ? `No items found for "${searchText}"`
                  : "No menu items available"}
              </Text>
            </View>
          ) : (
            searchResults.map((section, sectionIndex) => (
              <View key={`section-${sectionIndex}`} className="mb-6">
                {/* Section Header */}
                <View className="bg-panel py-2 border-b border-gray-800 mb-1">
                  <Text className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                    {section.title}
                  </Text>
                </View>

                {/* Section Items */}
                <View>
                  {section.data.map((item) => (
                    <SearchResultItem
                      key={item.uniqueKey}
                      item={item}
                      menuName={item.menuName}
                      displayPrice={item.displayPrice}
                      isDisabled={item.isDisabled}
                      disabledReason={item.disabledReason}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

export default SearchBottomSheet;
